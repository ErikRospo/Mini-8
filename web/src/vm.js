export default class MiniMachineVM {
  constructor(program, { printOutput, outputEl } = {}) {
    this.utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    this.utf8Buffer = [];
    this.reg = new Array(8).fill(0); // r0-r7
    this.ram = new Array(256).fill(0);
    this.stack = [];
    this.program = program;
    this.halted = false;
    this.PC = 7; // r7 is PC

    // Dependency injection for output
    this.printOutput = printOutput || (() => {});
    this.outputEl = outputEl || null;
  }

  fetch() {
    const pc = this.reg[this.PC];
    const idx = pc * 4;
    if (idx + 4 > this.program.length) {
      this.halted = true;
      return null;
    }
    return this.program.slice(idx, idx + 4);
  }

  getOperand(val, isImm) {
    if (!isImm) {
      if (val === 5) {
        // r5 behaves like ram[r4]
        return this.ram[this.reg[4]];
      }
      return this.reg[val & 0x7];
    }
    return val;
  }

  setReg(idx, value) {
    if (idx === 6) return; // r6 reserved

    value = value & 0xff;

    if (idx === 5) {
      // Write to ram at address in r4
      this.ram[this.reg[4]] = value;
    } else {
      this.reg[idx] = value;
    }
    if (idx === 4) {
      this.reg[5] = this.ram[value];
    }
  }

  wrt(val, fmt) {
    switch (fmt) {
      case 0:
        this.handleUtf8Byte(val);
        break;
      case 1:
        this.printOutput(val <= 9 ? val.toString() : "?");
        break;
      case 2:
        this.printOutput(val <= 25 ? String.fromCharCode(65 + val) : "?");
        break;
      case 3:
        this.printOutput(val <= 15 ? val.toString(16).toUpperCase() : "?");
        break;
    }
  }
  handleUtf8Byte(byte) {
    if (byte === 0x00) {
      if (this.outputEl) this.outputEl.innerText = "";
      this.utf8Buffer.length = 0;
      return;
    }

    this.utf8Buffer.push(byte);

    try {
      const decoded = this.utf8Decoder.decode(new Uint8Array(this.utf8Buffer));
      this.printOutput(decoded);
      this.utf8Buffer.length = 0; // clear buffer after successful decode
    } catch (e) {
      // Incomplete UTF-8 sequence — keep buffering
    }
  }

  execute(instr) {
    const [opcode, op1, op2, dest] = instr;
    const imm1 = (opcode >> 6) & 1;
    const imm2 = (opcode >> 5) & 1;
    const opclass = (opcode >> 3) & 0x3;
    const subtype = opcode & 0x7;

    // ALU
    if (opclass === 0b00) {
      let a = this.getOperand(op1, imm1);
      let b = this.getOperand(op2, imm2);
      let res = 0;
      switch (subtype) {
        case 0:
          res = a & b;
          break;
        case 1:
          res = ((a >>> b % 8) | (a << (8 - (b % 8)))) & 0xff;
          break;
        case 2:
          res = (a + b) & 0xff;
          break;
        case 3:
          res = a ^ b;
          break;
        case 4:
          res = a | b;
          break;
        case 5:
          res = ((a << b % 8) | (a >>> (8 - (b % 8)))) & 0xff;
          break;
        case 6:
          res = (a - b) & 0xff;
          break;
        case 7:
          res = ~a & 0xff;
          break;
      }
      this.setReg(dest & 0x7, res);
      this.reg[this.PC] = (this.reg[this.PC] + 1) % 256;
      return;
    }

    // COND
    if (opclass === 0b01) {
      let jump = false;
      let a = this.getOperand(op1, imm1);
      let b = this.getOperand(op2, imm2);
      switch (subtype) {
        case 0:
          jump = true;
          break;
        case 1:
          jump = a !== b;
          break;
        case 2:
          jump = a >= b;
          break;
        case 3:
          jump = a > b;
          break;
        case 4:
          jump = false;
          break;
        case 5:
          jump = a === b;
          break;
        case 6:
          jump = a < b;
          break;
        case 7:
          jump = a <= b;
          break;
      }
      if (jump) {
        this.setReg(this.PC, dest);
      } else {
        this.reg[this.PC] = (this.reg[this.PC] + 1) % 256;
      }
      return;
    }

    // IO
    if (opclass === 0b10) {
      switch (subtype) {
        case 0: {
          const val = this.getOperand(op1, imm1);
          this.setReg(dest & 0x7, val);
          break;
        }
        case 1: {
          const idx1 = op1 & 0x7;
          const idx2 = dest & 0x7;
          if (idx1 !== 6 && idx2 !== 6) {
            [this.reg[idx1], this.reg[idx2]] = [this.reg[idx2], this.reg[idx1]];
          }
          break;
        }
        case 2: {
          const val = this.getOperand(op1, imm1);
          this.stack.push(val);
          break;
        }
        case 3: {
          if (this.stack.length > 0) {
            this.setReg(dest & 0x7, this.stack.pop());
          }
          break;
        }
        case 4: {
          const val = this.getOperand(op1, imm1);
          const fmt = op2 & 0x3;
          this.wrt(val, fmt);
          break;
        }
        case 5: {
          const addr = this.getOperand(op1, imm1);
          this.stack.push(this.reg[this.PC]);
          this.setReg(this.PC, addr);
          return;
        }
        case 6: {
          let offset = this.reg[0];
          if (offset >= 0x80) offset -= 0x100;
          this.setReg(this.PC, (this.reg[this.PC] + offset) & 0xff);
          return;
        }
        case 7: {
          this.halted = true;
          return;
        }
      }
      this.reg[this.PC] = (this.reg[this.PC] + 1) % 256;
    }
  }
  renderRegisters() {
    const names = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "PC"];
    let out = names
      .map((n, i) => `${n}: ${this.reg[i].toString(16).padStart(2, "0")}`)
      .join("  ");
    document.getElementById("registers").textContent = out;
  }

  run() {
    while (!this.halted) {
      const instr = this.fetch();
      if (!instr) break;
      this.execute(instr);
    }
    this.printOutput("\n[Program Halted]\n");
  }

  step() {
    if (this.halted) return;
    const instr = this.fetch();
    if (!instr) {
      this.halted = true;
      return;
    }
    this.execute(instr);
  }
  disassemble(opcode, op1, op2, dest) {
    const imm1 = (opcode >> 6) & 1;
    const imm2 = (opcode >> 5) & 1;
    const opclass = (opcode >> 3) & 0x3;
    const subtype = opcode & 0x7;

    const regName = (idx) => `r${idx & 0x7}`;
    const opVal = (val, imm) =>
      imm
        ? `0x${val.toString(16).toUpperCase().padStart(2, "0")}`
        : regName(val);

    const immStr = `_${imm1 ? "i" : "r"}${imm2 ? "i" : "r"}`;

    if (opclass === 0b00) {
      // ALU
      const aluOps = ["AND", "ROR", "ADD", "XOR", "OR", "ROL", "SUB", "NOT"];
      const op = aluOps[subtype] || "???";
      if (op === "NOT") {
        return `${op} ${opVal(op1, imm1)}, ${regName(dest)}`;
      } else {
        return `${op} ${opVal(op1, imm1)}, ${opVal(op2, imm2)}, ${regName(
          dest
        )}`;
      }
    } else if (opclass === 0b01) {
      // COND
      const condOps = ["JMP", "JNE", "JGE", "JGT", "NOP", "JEQ", "JLT", "JLE"];
      const op = condOps[subtype] || "???";
      if (op === "JMP") {
        return `${op} 0x${dest.toString(16).toUpperCase().padStart(2, 0)}`;
      } else if (op === "NOP") {
        return `${op}`;
      } else {
        return `${op} ${opVal(op1, imm1)}, ${opVal(op2, imm2)}, 0x${dest
          .toString(16)
          .toUpperCase()}`;
      }
    } else if (opclass === 0b10) {
      // IO
      const ioOps = ["MOV", "SWAP", "PUSH", "POP", "WRT", "CALL", "JRE", "HCF"];
      const op = ioOps[subtype] || "???";
      if (op === "MOV") {
        return `${op} ${opVal(op1, imm1)}, ${regName(dest)}`;
      } else if (op === "SWAP") {
        return `${op} ${regName(op1)}, ${regName(dest)}`;
      } else if (op === "PUSH") {
        return `${op} ${opVal(op1, imm1)}`;
      } else if (op === "POP") {
        return `${op} ${regName(dest)}`;
      } else if (op === "WRT") {
        const fmt = op2 & 0x3;
        let op1Str;
        let modeComment = "";
        if (imm1) {
          if (fmt === 0) {
            // UTF-8
            modeComment = "; UTF-8";
            if (op1 === 0) {
              op1Str = "0x00";
            } else if (
              op1 < 32 ||
              op1 > 126 ||
              op1 === 34 ||
              op1 === 44 ||
              op1 === 32
            ) {
              op1Str = `0x${op1.toString(16).toUpperCase().padStart(2, "0")}`;
            } else {
              op1Str = `"${String.fromCharCode(op1)}"`;
            }
          } else if (fmt === 1) {
            // DEC
            modeComment = "; DEC";
            op1Str = op1.toString(10);
          } else if (fmt === 2) {
            // ALP
            modeComment = "; ALP";
            op1Str = op1.toString(10);
          } else if (fmt === 3) {
            // HEX
            modeComment = "; HEX";
            op1Str = `0x${op1.toString(16).toUpperCase().padStart(2, "0")}`;
          }
        } else {
          op1Str = regName(op1);
          if (fmt === 0) modeComment = "; UTF8";
          else if (fmt === 1) modeComment = "; DEC";
          else if (fmt === 2) modeComment = "; ALP";
          else if (fmt === 3) modeComment = "; HEX";
        }
        return `${op} ${op1Str}, 0b${fmt
          .toString(2)
          .padStart(2, "0")} ${modeComment}`;
      } else if (op === "CALL") {
        return `${op} ${opVal(op1, imm1)}`;
      } else if (op === "JRE" || op === "HCF") {
        return `${op}`;
      } else {
        return `${op} ???`;
      }
    } else {
      return "???";
    }
  }
}
