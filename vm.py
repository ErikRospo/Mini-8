import sys
import tty, termios


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
        instr = self.program[idx : idx + 4]
        return instr

    def immstr(self, imm1, imm2):
        im1s = "i" if imm1 else "r"
        im2s = "i" if imm2 else "r"
        return f"_{im1s}{im2s}"

    def disassemble(self, instr):
        opcode, op1, op2, dest = instr
        imm1 = (opcode >> 6) & 1
        imm2 = (opcode >> 5) & 1
        opclass = (opcode >> 3) & 0x3
        subtype = opcode & 0x7

        def reg_name(idx):
            return f"r{idx}"

        def op_val(val, imm):
            return f"{val} ({hex(val)})" if imm else reg_name(val & 0x7)

        imstr = self.immstr(imm1, imm2)
        if opclass == 0b00:
            # ALU
            alu_ops = ["AND", "ROR", "ADD", "XOR", "OR", "ROL", "SUB", "NOT"]
            op = alu_ops[subtype] if subtype < len(alu_ops) else "???"
            if op == "NOT":
                return f"{op}{imstr} {op_val(op1, imm1)}, {reg_name(dest & 0x7)}"
            else:
                return f"{op}{imstr} {op_val(op1, imm1)}, {op_val(op2, imm2)}, {reg_name(dest & 0x7)}"
        elif opclass == 0b01:
            # COND
            cond_ops = ["JMP", "JNE", "JGE", "JGT", "NOP", "JEQ", "JLT", "JLE"]
            op = cond_ops[subtype] if subtype < len(cond_ops) else "???"
            if op == "JMP":
                return f"{op} {dest}"
            elif op == "NOP":
                return f"{op}"
            else:
                return f"{op}{imstr} {op_val(op1, imm1)}, {op_val(op2, imm2)}, {dest}"
        elif opclass == 0b10:
            # IO
            io_ops = ["MOV", "SWAP", "PUSH", "POP", "WRT", "CALL", "RFT", "HCF"]
            op = io_ops[subtype] if subtype < len(io_ops) else "???"
            if op == "MOV":
                return f"{op}{imstr} {op_val(op1, imm1)}, {reg_name(dest & 0x7)}"
            elif op == "SWAP":
                return f"{op}{imstr} {reg_name(op1 & 0x7)}, {reg_name(dest & 0x7)}"
            elif op == "PUSH":
                return f"{op}{imstr} {op_val(op1, imm1)}"
            elif op == "POP":
                return f"{op}{imstr} {reg_name(dest & 0x7)}"
            elif op == "WRT":
                fmt_names = ["ASC", "DEC", "ALP", "HEX"]
                fmt = op2 & 0x3
                fmt_str = fmt_names[fmt] if fmt < len(fmt_names) else str(fmt)
                return f"{op}{imstr} {op_val(op1, imm1)}, {fmt_str}"
            elif op == "CALL":
                return f"{op}{imstr} {op_val(op1, imm1)}"
            elif op == "RFT":
                return f"{op}{imstr} {op_val(op1, imm1)}"
            elif op == "HCF":
                return f"{op}"
            else:
                return f"{op} ???"
        else:
            return "???"

    def program_format(self):
        # Format the program as a hex string for display
        # 4-byte instructions, each byte as two hex digits, separeted by spaces
        # with each instruction separated by two spaces, and each group of 4 instructions on a new line
        lines = []
        for i in range(0, len(self.program), 4):
            instr = self.program[i : i + 4]
            if len(instr) < 4:
                instr += b"\x00" * (4 - len(instr))
            hex_instr = " ".join(f"{b:02X}" for b in instr)
            lines.append(hex_instr)
        return "\n".join("  ".join(lines[i : i + 4]) for i in range(0, len(lines), 4))

    def run(self):
        while not self.halted:
            instr = self.fetch()
            if instr is None:
                break
            if self.debug:
                print(f"\nPC: {self.reg[self.PC]}")
                print(f"Instr: {[hex(b) for b in instr]}")
                print(f"Disasm: {self.disassemble(instr)}")
                print(f"Registers: {self.reg}")
                print(f"Program view: {self.program.hex().upper()}")
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
                self.stack.append((self.reg[self.PC]) % 256)
                self.set_reg(self.PC, addr)
                return
            elif subtype == 0b110:  # RFT
                fmt = op2 & 0x3
                input_val = None
                try:
                    fd = sys.stdin.fileno()
                    old_settings = termios.tcgetattr(fd)
                    try:
                        tty.setraw(fd)
                        user_input = sys.stdin.read(1)
                    finally:
                        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                except EOFError:
                    user_input = ""
                    input_val = 0xFE
                    self.set_reg(dest & 0x7, input_val)
                    return

                if fmt == 0:  # UTF-8
                    if user_input:
                        input_val = ord(user_input[0]) & 0xFF
                    else:
                        input_val = 0xFF
                elif fmt == 1:  # Decimal
                    if user_input.isdigit() and 0 <= int(user_input) <= 9:
                        input_val = int(user_input)
                    else:
                        input_val = 0xFF
                elif fmt == 2:  # Alphabetic
                    if user_input and user_input[0].isalpha():
                        ch = user_input[0].upper()
                        idx = ord(ch) - ord("A")
                        if 0 <= idx <= 25:
                            input_val = idx
                        else:
                            input_val = 0xFF
                    else:
                        input_val = 0xFF
                elif fmt == 3:  # Hexadecimal
                    if user_input and len(user_input) == 1 and user_input[0].upper() in "0123456789ABCDEF":
                        input_val = int(user_input[0], 16)
                    else:
                        input_val = 0xFF
                self.set_reg(dest & 0x7, input_val)
                return
            elif subtype == 0b111:  # HCF
                self.halted = True
                return
            self.reg[self.PC] = (self.reg[self.PC] + 1) % 256
            return

    def wrt(self, val, fmt):
        if fmt == 0:  # UTF-8
            if val == 0:
                self.term_buffer = ""
                print("\033c", end="")  # clear terminal
            else:
                print(chr(val), end="")
        elif fmt == 1:  # Decimal
            if val <= 9:
                print(str(val), end="")
            else:
                print("?", end="")
        elif fmt == 2:  # Alphabetic
            if val <= 25:
                print(chr(ord("A") + val), end="")
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
    v_opt = 0
    if "--debug" in sys.argv:
        debug = True
        sys.argv.remove("--debug")
    if "-vv" in sys.argv:
        v_opt = 2
        sys.argv.remove("-vv")
    elif "-v" in sys.argv:
        v_opt = 1
        sys.argv.remove("-v")

    if len(sys.argv) < 2:
        program_file = "out.mi8"
        print("No program specified, defaulting to out.mi8")
    else:
        program_file = sys.argv[1]
    with open(program_file, "rb") as f:
        program = f.read()

    vm = MiniMachineVM(program, debug=debug)
    if v_opt == 1:
        print("Program (hex):")
        print(vm.program_format())
        sys.exit(0)
    elif v_opt == 2:
        print("Program (hex):")
        print(vm.program_format())
        print("\nDisassembly:")
        for i in range(0, len(program), 4):
            instr = program[i : i + 4]
            if len(instr) < 4:
                instr += b"\x00" * (4 - len(instr))
            addr = i // 4
            disasm = vm.disassemble(instr)
            hex_instr = " ".join(f"{b:02X}" for b in instr)
            print(f"{addr:02X}: {hex_instr}  {disasm}")
        sys.exit(0)
    vm.run()
