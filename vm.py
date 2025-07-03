import sys

class MiniMachineVM:
    def __init__(self, program: bytes, debug: bool = False):
        self.reg = [0] * 8  # r0-r7
        self.ram = [0] * 256
        self.stack = []
        self.program = program
        self.halted = False
        self.term_buffer = ""
        self.PC = 7  # r7 is PC
        self.debug = debug

    def fetch(self):
        pc = self.reg[self.PC]
        idx = pc * 4
        if idx + 4 > len(self.program):
            self.halted = True
            return None
        instr = self.program[idx:idx+4]
        return instr

    def run(self):
        while not self.halted:
            instr = self.fetch()
            if instr is None:
                break
            if self.debug:
                print(f"\nPC: {self.reg[self.PC]}")
                print(f"Instr: {[hex(b) for b in instr]}")
                print(f"Registers: {self.reg}")
                print(f"Program view: {self.program.hex()}")
                input("Press Enter to step...")
            self.execute(instr)
            # PC increment unless changed by jump/call/halt
            if not self.halted and self.reg[self.PC] == (self.reg[self.PC] - 1) % 256:
                self.reg[self.PC] = (self.reg[self.PC] + 1) % 256

    def get_operand(self, val, is_imm):
        return val if is_imm else self.reg[val & 0x7]

    def set_reg(self, idx, value):
        if idx == 6:
            return  # r6 is reserved
        self.reg[idx] = value & 0xFF

    def execute(self, instr):
        opcode, op1, op2, dest = instr
        # Decode opcode
        imm1 = (opcode >> 6) & 1
        imm2 = (opcode >> 5) & 1
        opclass = (opcode >> 3) & 0x3
        subtype = opcode & 0x7

        # ALU
        if opclass == 0b00:
            a = self.get_operand(op1, imm1)
            b = self.get_operand(op2, imm2)
            if subtype == 0b000:  # AND
                res = a & b
            elif subtype == 0b001:  # ROR
                res = ((a >> (b % 8)) | (a << (8 - (b % 8)))) & 0xFF
            elif subtype == 0b010:  # ADD
                res = (a + b) & 0xFF
            elif subtype == 0b011:  # XOR
                res = a ^ b
            elif subtype == 0b100:  # OR
                res = a | b
            elif subtype == 0b101:  # ROL
                res = ((a << (b % 8)) | (a >> (8 - (b % 8)))) & 0xFF
            elif subtype == 0b110:  # SUB
                res = (a - b) & 0xFF
            elif subtype == 0b111:  # NOT
                a = self.get_operand(op1, imm1)
                res = (~a) & 0xFF
            else:
                return
            self.set_reg(dest & 0x7, res)
            self.reg[self.PC] = (self.reg[self.PC] + 1) % 256
            return

        # COND
        elif opclass == 0b01:
            jump = False
            a = self.get_operand(op1, imm1)
            b = self.get_operand(op2, imm2)
            if subtype == 0b000:  # JMP (always)
                jump = True
            elif subtype == 0b001:  # JNE
                jump = a != b
            elif subtype == 0b010:  # JGE (unsigned)
                jump = a >= b
            elif subtype == 0b011:  # JGT (unsigned)
                jump = a > b
            elif subtype == 0b100:  # NOP (never)
                jump = False
            elif subtype == 0b101:  # JEQ
                jump = a == b
            elif subtype == 0b110:  # JLT (unsigned)
                jump = a < b
            elif subtype == 0b111:  # JLE (unsigned)
                jump = a <= b
            if jump:
                self.set_reg(self.PC, dest)
            else:
                self.reg[self.PC] = (self.reg[self.PC] + 1) % 256
            return

        # IO
        elif opclass == 0b10:
            if subtype == 0b000:  # MOV
                val = self.get_operand(op1, imm1)
                self.set_reg(dest & 0x7, val)
            elif subtype == 0b001:  # SWAP
                idx1 = op1 & 0x7
                idx2 = dest & 0x7
                if idx1 != 6 and idx2 != 6:
                    self.reg[idx1], self.reg[idx2] = self.reg[idx2], self.reg[idx1]
            elif subtype == 0b010:  # PUSH
                val = self.get_operand(op1, imm1)
                self.stack.append(val)
            elif subtype == 0b011:  # POP
                if self.stack:
                    self.set_reg(dest & 0x7, self.stack.pop())
            elif subtype == 0b100:  # WRT
                val = self.get_operand(op1, imm1)
                fmt = op2 & 0x3
                self.wrt(val, fmt)
            elif subtype == 0b101:  # CALL
                addr = self.get_operand(op1, imm1)
                self.stack.append((self.reg[self.PC] + 1) % 256)
                self.set_reg(self.PC, addr)
                return
            elif subtype == 0b110:  # JRE
                offset = self.reg[0]
                if offset >= 0x80:
                    offset = offset - 0x100  # signed
                self.set_reg(self.PC, (self.reg[self.PC] + offset) % 256)
                return
            elif subtype == 0b111:  # HCF
                self.halted = True
                return
            self.reg[self.PC] = (self.reg[self.PC] + 1) % 256
            return

    def wrt(self, val, fmt):
        if fmt == 0:  # ASCII
            if val == 0:
                self.term_buffer = ""
                print("\033c", end="")  # clear terminal
            elif val <= 0x7F:
                print(chr(val), end="")
        elif fmt == 1:  # Decimal
            if val <= 9:
                print(str(val), end="")
            else:
                print("?", end="")
        elif fmt == 2:  # Alphabetic
            if val <= 25:
                print(chr(ord('A') + val), end="")
            else:
                print("?", end="")
        elif fmt == 3:  # Hexadecimal
            if val <= 0xF:
                print(hex(val)[2:].upper(), end="")
            else:
                print("?", end="")
        sys.stdout.flush()

if __name__ == "__main__":
    debug = False
    if "--debug" in sys.argv:
        debug = True
        sys.argv.remove("--debug")
    if len(sys.argv) < 2:
        print("Usage: python vm.py <program.bin> [--debug]")
        sys.exit(1)
    with open(sys.argv[1], "rb") as f:
        program = f.read()
    vm = MiniMachineVM(program, debug=debug)
    vm.run()