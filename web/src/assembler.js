export const OPCODES = {
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
  RFT: ["IO", 0b110],
  HCF: ["IO", 0b111],
};

export const OPCLASS = { ALU: 0b00, COND: 0b01, IO: 0b10 };

export const REGISTERS = {
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

export function parseValue(val, constants) {
  try {
    val = val.trim();
  } catch (err) {
    if (typeof val === "number")
      return { value: val & 0xff, isRegister: false };
    throw new Error("Error parsing value: " + val);
  }
  if (val in constants) {
    const c = constants[val];
    if (
      typeof c === "object" &&
      c !== null &&
      "value" in c &&
      "isRegister" in c
    ) {
      return c;
    }
    if (isRegister(c)) return { value: REGISTERS[c], isRegister: true };
    return { value: c & 0xff, isRegister: false };
  }
  if (/^['"](.{1})['"]$/.test(val))
    return { value: val.charCodeAt(1) & 0xff, isRegister: false };
  if (val.startsWith("0x"))
    return {
      value: parseInt(val.replace("0x", ""), 16) & 0xff,
      isRegister: false,
    };
  if (val.startsWith("0b"))
    return {
      value: parseInt(val.replace("0b", ""), 2) & 0xff,
      isRegister: false,
    };
  if (/^\d+$/.test(val))
    return { value: parseInt(val, 10) & 0xff, isRegister: false };
  throw new Error("Unknown value: " + val);
}

export function isRegister(val) {
  if (typeof val === "object" && val !== null && "isRegister" in val) {
    return val.isRegister;
  }
  if (/^R[0-7]$/.test(val)) {
    throw new Error(
      `Register names must be lowercase (use "r${val[1]}" instead of "${val}")`
    );
  }
  return val in REGISTERS;
}

export function encodeOpcode(mnemonic, op1, op2) {
  let [cls, subtype] = OPCODES[mnemonic];
  // Use metadata if available
  let imm1 = op1 && !isRegister(op1) ? 1 : 0;
  let imm2 = op2 && !isRegister(op2) ? 1 : 0;
  if (typeof op1 === "object" && op1 !== null && "isRegister" in op1) {
    imm1 = !op1.isRegister ? 1 : 0;
  }
  if (typeof op2 === "object" && op2 !== null && "isRegister" in op2) {
    imm2 = !op2.isRegister ? 1 : 0;
  }
  return (imm1 << 6) | (imm2 << 5) | (OPCLASS[cls] << 3) | subtype;
}

export function encodeOperand(val, constants) {
  if (!val) return 0;
  if (typeof val === "object" && val !== null && "value" in val) {
    return val.value;
  }
  if (isRegister(val)) return REGISTERS[val];
  return parseValue(val, constants).value;
}

export function handleShorthand(op, args) {
  args = [...args];
  if (op === "MOV" && args.length === 2) args.splice(1, 0, "0");
  else if (op === "HCF") args = ["0", "0", "0"];
  else if (op === "WRT" && args.length === 1) args.push("0", "0");
  else if (op === "WRT" && args.length === 2) args.push("0");
  else if (op === "RFT" && args.length === 1) args = ["0", "0", args[0]];
  else if (op === "RFT" && args.length === 2) args = ["0", args[0], args[1]];
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
          constants[name] = { value: body.trim(), isRegister: true };
        } else {
          const parsed = parseValue(body, constants);
          constants[name] = parsed;
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
        constants[label] = { value: pc, isRegister: false };
        continue;
      }

      let args = handleShorthand(mnemonic, tokens.slice(1));
      for (let i = 0; i < 3; i++) {
        if (args[i] in labels)
          args[i] = { value: labels[args[i]], isRegister: false };
        else if (args[i]?.startsWith("$")) {
          unresolved.push([output.length, i, args[i].slice(1)]);
          args[i] = { value: 0, isRegister: false };
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
