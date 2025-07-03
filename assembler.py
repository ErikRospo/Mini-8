import re
import sys

# --- ISA encoding tables (partial, extend as needed) ---
OPCODES = {
    'AND':  ('ALU', 0b000),
    'ROR':  ('ALU', 0b001),
    'ADD':  ('ALU', 0b010),
    'XOR':  ('ALU', 0b011),
    'OR':   ('ALU', 0b100),
    'ROL':  ('ALU', 0b101),
    'SUB':  ('ALU', 0b110),
    'NOT':  ('ALU', 0b111),
    'JMP':  ('COND', 0b000),
    'JNE':  ('COND', 0b001),
    'JGE':  ('COND', 0b010),
    'JGT':  ('COND', 0b011),
    'NOP':  ('COND', 0b100),
    'JEQ':  ('COND', 0b101),
    'JLT':  ('COND', 0b110),
    'JLE':  ('COND', 0b111),
    'MOV':  ('IO', 0b000),
    'SWAP': ('IO', 0b001),
    'PUSH': ('IO', 0b010),
    'POP':  ('IO', 0b011),
    'WRT':  ('IO', 0b100),
    'CALL': ('IO', 0b101),
    'JRE':  ('IO', 0b110),
    'HCF':  ('IO', 0b111),
}

OPCLASS = {
    'ALU': 0b00,
    'COND': 0b01,
    'IO': 0b10,
}

REGISTERS = {
    'r0': 0, 'r1': 1, 'r2': 2, 'r3': 3,
    'r4': 4, 'r5': 5, 'r6': 6, 'r7': 7,
    'RAMADDR': 4, 'RAMDATA': 5, 'PC': 7,
}

# --- Utility functions ---
def parse_value(val, constants):
    val = val.strip()
    if val in constants:
        return constants[val]
    if val.startswith('0x'):
        return int(val, 16)
    if val.startswith('0b'):
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
    for line in lines:
        line = line.split(';')[0].strip()
        if not line:
            continue
        if line.startswith('define '):
            # Constant or macro
            m = re.match(r'define\s+(\w+)\s+(.+)', line)
            if m:
                name, val = m.group(1), m.group(2)
                if ':' in val:
                    # Macro, skip for now
                    macros[name] = val
                else:
                    constants[name] = parse_value(val, constants)
            continue
        if line.endswith(':'):
            labels[line[:-1]] = pc
            continue
        expanded.append(line)
        pc += 1

    # Second pass: assemble instructions
    pc = 0
    output = []
    for line in expanded:
        tokens = re.split(r'[,\s]+', line.strip())
        if not tokens or not tokens[0]:
            continue
        mnemonic = tokens[0].upper()
        args = tokens[1:]
        # Macro expansion (minimal, no args)
        if mnemonic in macros:
            continue  # Not implemented: macro expansion
        # Label resolution in args
        for i, arg in enumerate(args):
            if arg in labels:
                args[i] = str(labels[arg])
        # Fill missing args
        while len(args) < 3:
            args.append('0')
        op1, op2, dest = args[:3]
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
    parser.add_argument('input', help='Input assembly file')
    parser.add_argument('-o', '--output', help='Output binary file', default='a.out')
    args = parser.parse_args()
    with open(args.input) as f:
        lines = f.readlines()
    binprog = assemble(lines)
    with open(args.output, 'wb') as f:
        for instr in binprog:
            f.write(instr)

if __name__ == '__main__':
    main()
