import re
from typing import List

# --- ISA encoding tables (partial, extend as needed) ---
OPCODES = {
    "AND": ("ALU", 0b000),
    "ROR": ("ALU", 0b001),
    "ADD": ("ALU", 0b010),
    "XOR": ("ALU", 0b011),
    "OR": ("ALU", 0b100),
    "ROL": ("ALU", 0b101),
    "SUB": ("ALU", 0b110),
    "NOT": ("ALU", 0b111),
    "JMP": ("COND", 0b000),
    "JNE": ("COND", 0b001),
    "JGE": ("COND", 0b010),
    "JGT": ("COND", 0b011),
    "NOP": ("COND", 0b100),
    "JEQ": ("COND", 0b101),
    "JLT": ("COND", 0b110),
    "JLE": ("COND", 0b111),
    "MOV": ("IO", 0b000),
    "SWAP": ("IO", 0b001),
    "PUSH": ("IO", 0b010),
    "POP": ("IO", 0b011),
    "WRT": ("IO", 0b100),
    "CALL": ("IO", 0b101),
    "JRE": ("IO", 0b110),
    "HCF": ("IO", 0b111),
}

OPCLASS = {
    "ALU": 0b00,
    "COND": 0b01,
    "IO": 0b10,
}

REGISTERS = {
    "r0": 0,
    "r1": 1,
    "r2": 2,
    "r3": 3,
    "r4": 4,
    "r5": 5,
    "r6": 6,
    "r7": 7,
    "RAMADDR": 4,
    "RAMDATA": 5,
    "PC": 7,
}


# --- Utility functions ---
def parse_value(val, constants):
    val = val.strip()
    if val in constants:
        return constants[val]
    if len(val) == 3 and ((val[0] == val[-1] == "'") or (val[0] == val[-1] == '"')):
        # Char literal, e.g. 'A' or "A"
        return ord(val[1])
    if val.startswith("0x"):
        return int(val, 16)
    if val.startswith("0b"):
        return int(val, 2)
    if val.isdigit():
        return int(val)
    raise ValueError(f"Unknown value: {val}")


def is_register(val):
    return val in REGISTERS


def encode_opcode(mnemonic, op1, op2):
    # Bit 7: reserved (0)
    # Bits 6-5: immediate flags
    # Bits 4-3: class
    # Bits 2-0: subtype
    opclass, subtype = OPCODES[mnemonic]
    class_bits = OPCLASS[opclass] << 3
    subtype_bits = subtype
    imm1 = 1 if (op1 and not is_register(op1)) else 0
    imm2 = 1 if (op2 and not is_register(op2)) else 0
    return (imm1 << 6) | (imm2 << 5) | class_bits | subtype_bits


def encode_operand(val, constants):
    if val is None:
        return 0
    if is_register(val):
        return REGISTERS[val]
    return parse_value(val, constants) & 0xFF


# --- Assembler core ---
def assemble(lines):
    # First pass: handle constants, macros, labels
    constants = {}
    macros = {}
    labels = {}
    code = []
    pc = 0
    expanded = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].split(";")[0].strip()
        if not line:
            i += 1
            continue
        if line.startswith("define "):
            # Support macro arguments: define MACRO(arg1,arg2): ... end
            m = re.match(r"define\s+(\w+)(\((.*?)\))?(\:)?\s*(.*)", line)
            if m:
                name = m.group(1)
                arglist = m.group(3)
                colon = m.group(4)
                rest = m.group(5)
                macro_args = []
                if arglist:
                    macro_args = [a.strip() for a in arglist.split(",") if a.strip()]
                if colon:
                    # Macro: collect lines until 'end' or next define or EOF
                    macro_lines = []
                    i += 1
                    while i < n:
                        next_line = lines[i].split(";")[0].strip()
                        if next_line == "end":
                            i += 1
                            break
                        if next_line.startswith("define "):
                            break
                        if next_line:
                            macro_lines.append(next_line)
                        i += 1
                    macros[name.upper()] = (macro_args, macro_lines)
                    continue
                else:
                    constants[name] = parse_value(rest, constants)
                    i += 1
                    continue
        # Handle multiple labels on the same line, e.g. "foo: bar: instr"
        while True:
            m = re.match(r"^(\w+):\s*(.*)", line)
            if m:
                label = m.group(1)
                rest = m.group(2)
                labels[label] = pc
                line = rest
                if not line:
                    break
            else:
                break
        if not line:
            i += 1
            continue
        expanded.append(line)
        pc += 1
        i += 1

    # Macro expansion (recursive, with args)
    def expand_macros(lines, parent_args=None):
        result = []
        for line in lines:
            tokens = re.split(r"[,\s]+", line.strip())
            if not tokens or not tokens[0]:
                continue
            mnemonic = tokens[0].upper()
            if mnemonic in macros:
                macro_args, macro_body = macros[mnemonic]
                # Parse actual arguments from invocation
                # e.g. MACRO x, y, z
                actual_args = tokens[1 : 1 + len(macro_args)]
                arg_map = dict(zip(macro_args, actual_args))

                # Support parent macro argument substitution
                def subst_args(l: str):
                    # Replace $arg or {arg} with value
                    for k, v in arg_map.items():
                        l = l.replace(f"{k}", v)
                    if parent_args:
                        for k, v in parent_args.items():
                            l = l.replace(f"{k}", v)

                    return l

                expanded_body = [subst_args(l) for l in macro_body]
                result.extend(expand_macros(expanded_body, arg_map))
            else:
                # Substitute parent macro arguments if any
                if parent_args:
                    for k, v in parent_args.items():
                        line = line.replace(f"{k}", v)
                result.append(line)
        return result

    def handle_shorthand_op(op: str, args: List[str]) -> List[str]:
        if op == "MOV":
            if len(args) == 2:
                args.insert(1, "0")
        elif op == "HCF":
            args = ["0", "0", "0"]
        elif op == "WRT":
            if len(args) == 1:
                args.append("0")
                print(
                    f"Warning: WRT with one argument: {args}. Defaulting to mode 0, ASCII"
                )
            if len(args) == 2:  # make DEST 0
                args.append("0")
        elif op == "PUSH" and len(args) == 1:
            args.append("0")
            args.append("0")
        elif op == "POP" and len(args) == 1:
            args = ["0", "0", args[0]]

        return args

    expanded = expand_macros(expanded)
    # Second pass: assemble instructions
    pc = 0
    output = []
    for line in expanded:
        # Remove inline labels (should not be present after first pass, but just in case)
        while True:
            m = re.match(r"^(\w+):\s*(.*)", line)
            if m:
                line = m.group(2)
            else:
                break
        if not line.strip():
            continue
        tokens = re.split(r"[,\s]+", line.strip())
        if not tokens or not tokens[0]:
            continue
        mnemonic = tokens[0].upper()
        if mnemonic == "LABEL":
            # Handle label definition, e.g. "LABEL foo"
            if len(tokens) != 2:
                raise ValueError(f"Invalid LABEL definition: {line}")
            label_name = tokens[1].strip().strip(":")
            if label_name in labels:
                raise ValueError(f"Label '{label_name}' already defined")
            labels[label_name] = pc
            constants[label_name] = pc  # Also treat label as constant
            # pc += 1  # Increment PC for label definition
            continue
        args = tokens[1:]
        # Macro expansion handled above
        # Label resolution in args (support labels as operands)
        for i, arg in enumerate(args):
            if arg in labels:
                args[i] = str(labels[arg])
        # Fill missing args
        args = handle_shorthand_op(mnemonic, args)
        op1, op2, dest = args[:3]
        if mnemonic not in OPCODES:
            raise ValueError(f"Unknown mnemonic: {mnemonic}")
        opcode = encode_opcode(mnemonic, op1, op2)
        b1 = opcode
        b2 = encode_operand(op1, constants)
        b3 = encode_operand(op2, constants)
        b4 = encode_operand(dest, constants)
        output.append(bytes([b1, b2, b3, b4]))
        pc += 1
    return output


# --- Main entry point ---
def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Input assembly file")
    parser.add_argument("-o", "--output", help="Output binary file", default="a.out")
    args = parser.parse_args()
    with open(args.input) as f:
        lines = f.readlines()
    binprog = assemble(lines)
    with open(args.output, "wb") as f:
        for instr in binprog:
            f.write(instr)


if __name__ == "__main__":
    main()
