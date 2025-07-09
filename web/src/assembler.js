const OPCODES = {
  AND: ["ALU", 0b000],
  ROR: ["ALU", 0b001],
  ADD: ["ALU", 0b010],
  XOR: ["ALU", 0b011],
  OR: ["ALU", 0b100],
  ROL: ["ALU", 0b101],
  SUB: ["ALU", 0b110],
  NOT: ["ALU", 0b111],
  JMP: ["COND", 0b000],
  JNE: ["COND", 0b001],
  JGE: ["COND", 0b010],
  JGT: ["COND", 0b011],
  NOP: ["COND", 0b100],
  JEQ: ["COND", 0b101],
  JLT: ["COND", 0b110],
  JLE: ["COND", 0b111],
  MOV: ["IO", 0b000],
  SWAP: ["IO", 0b001],
  PUSH: ["IO", 0b010],
  POP: ["IO", 0b011],
  WRT: ["IO", 0b100],
  CALL: ["IO", 0b101],
  JRE: ["IO", 0b110],
  HCF: ["IO", 0b111],
};

const OPCLASS = { ALU: 0b00, COND: 0b01, IO: 0b10 };

const REGISTERS = {
  r0: 0,
  r1: 1,
  r2: 2,
  r3: 3,
  r4: 4,
  r5: 5,
  r6: 6,
  r7: 7,
  RAMADDR: 4,
  RAMDATA: 5,
  PC: 7,
};

function parseValue(val, constants) {
  val = val.trim();
  if (val in constants) {
    const c = constants[val];
    if (isRegister(c)) return REGISTERS[c];
    return c & 0xff;
  }
  if (/^['"](.{1})['"]$/.test(val)) return val.charCodeAt(1) & 0xff;
  if (val.startsWith("0x")) return parseInt(val.replace("0x", ""), 16) & 0xff;
  if (val.startsWith("0b")) return parseInt(val.replace("0b", ""), 2) & 0xff;
  if (/^\d+$/.test(val)) return parseInt(val, 10) & 0xff;
  throw new Error("Unknown value: " + val);
}

function isRegister(val) {
  if (/^R[0-7]$/.test(val)) {
    throw new Error(
      `Register names must be lowercase (use "r${val[1]}" instead of "${val}")`
    );
  }
  return val in REGISTERS;
}

function encodeOpcode(mnemonic, op1, op2) {
  let [cls, subtype] = OPCODES[mnemonic];
  let imm1 = op1 && !isRegister(op1) ? 1 : 0;
  let imm2 = op2 && !isRegister(op2) ? 1 : 0;
  return (imm1 << 6) | (imm2 << 5) | (OPCLASS[cls] << 3) | subtype;
}

function encodeOperand(val, constants) {
  if (!val) return 0;
  return isRegister(val) ? REGISTERS[val] : parseValue(val, constants);
}

function handleShorthand(op, args) {
  args = [...args];
  if (op === "MOV" && args.length === 2) args.splice(1, 0, "0");
  else if (op === "HCF") args = ["0", "0", "0"];
  else if (op === "WRT" && args.length === 1) args.push("0", "0");
  else if (op === "WRT" && args.length === 2) args.push("0");
  else if (op === "PUSH" && args.length === 1) args.push("0", "0");
  else if (op === "POP" && args.length === 1) args = ["0", "0", args[0]];
  else if (op === "JMP" && args.length === 1) args = ["0", "0", args[0]];
  else if (op === "CALL" && args.length === 1) args.push("0", "0");
  return args;
}

export function assembleFromLines(lines) {
  let origLineToPc = {};
  let constants = {},
    labels = {},
    pc = 0,
    code = [];
  let expanded = [],
    unresolved = [];

  // --- First pass: Constants ---
  for (let i = 0; i < lines.length; ) {
    let line = lines[i].split(";")[0].trim();
    if (!line) {
      // origLineToPc[i] = pc;
      i++;
      continue;
    }

    const defineMatch = line.match(/^define\s+(\w+)\s*(.*)?/);
    if (defineMatch) {
      const [_, name, body] = defineMatch;
      try {
        if (body && isRegister(body.trim())) {
          constants[name] = body.trim();
        } else {
          constants[name] = parseValue(body, constants);
        }
      } catch (err) {
        throw new Error(
          `Error parsing constant on line ${i + 1}: "${lines[i]}"\n${
            err.message
          }`
        );
      }
      i++;
      continue;
    }

    expanded.push({ line, origLine: i });

    pc++;
    i++;
  }

  // --- Second pass: Assemble ---
  pc = 0;
  const output = [];

  for (let { line, origLine } of expanded) {
    let originalLineContent = lines[origLine];
    try {
      while (line.match(/^(\w+):\s*(.*)/)) {
        const m = line.match(/^(\w+):\s*(.*)/);
        if (!m) break;
        line = m[2];
      }

      if (!line.trim()) {
        origLineToPc[origLine] = pc; 
        continue;
      }
      const tokens = line.trim().split(/[,\s]+/);
      const mnemonic = tokens[0].toUpperCase();

      if (mnemonic === "LABEL") {
        const label = tokens[1].replace(/:$/, "");
        labels[label] = pc;
        constants[label] = pc;
        continue;
      }

      let args = handleShorthand(mnemonic, tokens.slice(1));
      for (let i = 0; i < 3; i++) {
        if (args[i] in labels) args[i] = labels[args[i]].toString();
        else if (args[i]?.startsWith("$")) {
          unresolved.push([output.length, i, args[i].slice(1)]);
          args[i] = "0";
        }
        if (args[i] in constants) {
          args[i] = constants[args[i]];
        }
      }

      if (!(mnemonic in OPCODES))
        throw new Error("Unknown mnemonic: " + mnemonic);
      const [op1, op2, dest] = args;
      let b1, b2, b3, b4;
      try {
        b1 = encodeOpcode(mnemonic, op1, op2);
        b2 = encodeOperand(op1, constants);
        b3 = encodeOperand(op2, constants);
        b4 = encodeOperand(dest, constants);
      } catch (err) {
        throw new Error(
          `Error encoding operands on line ${
            origLine + 1
          }: "${originalLineContent}"\n${err.message}`
        );
      }
      output.push([b1, b2, b3, b4]);
      origLineToPc[origLine] = pc;
      pc++;
    } catch (err) {
      throw new Error(
        `Assembly error on line ${origLine + 1}: "${originalLineContent}"\n${
          err.message
        }`
      );
    }
  }

  // --- Resolve labels ---
  for (const [idx, argIdx, label] of unresolved) {
    if (!("$" + label in labels))
      throw new Error(
        `Undefined label: $${label}\nReferenced at instruction #${idx}`
      );
    output[idx][argIdx + 1] = labels["$" + label] & 0xff;
  }

  // --- Emit ---
  const hex = output
    .flat()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return { hex, origLineToPc };
}

// For browser compatibility, keep a DOM-based wrapper
export function assemble() {
  const disasmEl = document.getElementById("disasm");
  const rawCodeInput = document.getElementById("rawCodeInput");
  const lines = disasmEl.innerText.split("\n");
  const { hex, origLineToPc } = assembleFromLines(lines);
  rawCodeInput.value = hex;
  return origLineToPc;
}
