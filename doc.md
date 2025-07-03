# ISA Documentation

**4 bytes per instruction:**  
`OPCODE OPERAND1 OPERAND2 DEST`

## Opcode Bits
Opcode is a 1 byte value, with the following structure:

* Bit 7 (MSB): Reserved 
* Bits 6-5: Operands *1* and *2*, respectively. If set, operands are immediate, otherwise, they point to a [register](#Register)  
* Bits 4-3:  operator class/type:  
   - `00`: `ALU`/Arethmetic operations  
   - `01`: `COND`/Conditional    
   - `10`: `IO`/etc  
   - `11`: Undefined/reserved for now  
* Bits 2-0 (LSB): operator subtype, see below


### Subtypes

| `OPT`  | `VAL` | `Result`         | `NAME`  | `FULL OPC`    | `OP1` | `OP2` | `DEST` |
|--------|-------|------------------|---------|---------------|-------|-------|--------|
| `ALU`  | `000` | `OP1 & OP2`      | `AND`   | `XXX00000`    | Yes   | Yes   | Yes    |
| `ALU`  | `001` | `OP1 ROR OP2`    | `ROR`   | `XXX00100`    | Yes   | Yes   | Yes    |
| `ALU`  | `010` | `OP1 + OP2`      | `ADD`   | `XXX00010`    | Yes   | Yes   | Yes    |
| `ALU`  | `011` | `OP1 ^ OP2`      | `XOR`   | `XXX00011`    | Yes   | Yes   | Yes    |
| `ALU`  | `100` | `OP1 \| OP2`     | `OR`    | `XXX00001`    | Yes   | Yes   | Yes    |
| `ALU`  | `101` | `OP1 ROL OP2`    | `ROL`   | `XXX00101`    | Yes   | Yes   | Yes    |
| `ALU`  | `110` | `OP1 - OP2`      | `SUB`   | `XXX00110`    | Yes   | Yes   | Yes    |
| `ALU`  | `111` | `!OP1`           | `NOT`   | `XXX00111` (ignores OP2) | Yes   | No    | Yes    |
| `COND` | `000` | Always           | `JMP`   | `XXX01000` (unconditional jump) | No    | No    | Yes    |
| `COND` | `001` | `OP1 != OP2`     | `JNE`   | `XXX01001`    | Yes   | Yes   | Yes    |
| `COND` | `010` | `OP1 >= OP2`     | `JGE`   | `XXX01010` *  | Yes   | Yes   | Yes    |
| `COND` | `011` | `OP1 > OP2`      | `JGT`   | `XXX01011` *  | Yes   | Yes   | Yes    |
| `COND` | `100` | Never            | `NOP`   | `XXX01100` (never jumping is a no-op) | No    | No    | No     |
| `COND` | `101` | `OP1 == OP2`     | `JEQ`   | `XXX01101`    | Yes   | Yes   | Yes    |
| `COND` | `110` | `OP1 < OP2`      | `JLT`   | `XXX01110` *  | Yes   | Yes   | Yes    |
| `COND` | `111` | `OP1 <= OP2`     | `JLE`   | `XXX01111` *  | Yes   | Yes   | Yes    |
| `IO`   | `000` | `DEST=OP1`        | `MOV`   | `XX010000`    | Yes   | No    | Yes    |
| `IO`   | `001` | Swap OP1<->DEST   | `SWAP`  | `X0X10001`    | Yes   | No    | Yes    |
| `IO`   | `010` | Push OP1 onto stack | `PUSH` | `XXX10010`    | Yes   | No    | No     |
| `IO`   | `011` | Pop stack into out | `POP`  | `XXX10011`    | No    | No    | Yes    |
| `IO`   | `100` | Write OP1 to TERM | `WRT`  | `XXX10100` (See [WRT](#WRT)) | Yes   | Yes   | No     |
| `IO`   | `101` | Call              | `CALL` | `XXX10101`    | Yes   | No    | No     |
| `IO`   | `110` | Jump Relative     | `JRE`  | `XXX10110`    | No    | No    | No     |
| `IO`   | `111` | Halt              | `HCF`  | `XXX10111`    | No    | No    | No     |

`RET` can be implemented by macros by `POP`ing the stack into the PC register, `r7`.

`DEST` is always a register, and is the destination of the operation. For `MOV` and `SWAP`, OP1 is the source, and OP2 is the destination.
\*: All comparisons are unsigned

Jumps are to absolute locations.
Unless stated otherwise, all immediates are unsigned 8-bit integers, and all registers are 8-bit unsigned integers.
The only exception is the `JRE` instruction, which interprets the value in `r0` as a signed 8-bit integer, and jumps to the address `PC + r0`, where `PC` is the current value of the program counter (`r7`).
Two's complement is used for signed integers, so `0x80` is `-128`, and `0x7F` is `127`. To convert an u8 to an i8, the `SUB` instruction can be used with `0x80` as the second operand, e.g. `SUB r0, 0x80, r1` will convert the value in `r0` to a signed integer in `r1`.

In operations where `DEST` is not used, the value in `DEST` should be 0 by specification, and is ignored by the operation.  
The same applies to `OP2` in `NOT`, `NOP`, `PUSH`, `POP`, `CALL`, `MOV`, `JRE`, and `HCF` instructions, which are ignored and should be set to 0 by specification.
The only times `OP1` is ignored are in the `NOP` and `HCF` instructions, which are no-ops and halt the program, respectively. `OP1` should be set to 0 by specification in these cases.



####  WRT
The `WRT` instruction writes the value in OP1 to the terminal.
OP2 specifies the format to use for the output, and is a 2-bit value:
| Format      | OP2 Value | Description                                                                 | Max Supported Value |
|-------------|-----------|-----------------------------------------------------------------------------|--------------------|
| ASCII       | `00`      | ASCII character output (default)                                            | `0x7F` (DEL)       |
| Decimal     | `01`      | Unsigned decimal output (e.g. `0x00` is `0`, `0x09` is `9`)               | `0x09` (9)       |
| Alphabetic  | `10`      | Alphabetic output, indexed by OP1 (`0` is `A`, `1` is `B`, ..., `25` is `Z`)| `0x19` (25, `Z`)   |
| Hexadecimal | `11`      | Hexadecimal output (e.g. `0x0` is `0`, `0x2` is `2`, `0xF` is `F`)        | `0x0F` (16)        |

Calling `WRT` with an immediate value greater than the maximum supported value for the specified format will result in a `?` being printed for that format.

Calling `WRT` in ASCII format with an immediate value of `0x00` will clear the terminal. 

#### Jump Instructions
The `JMP`, `JNE`, `JGE`, `JGT`, `JEQ`, `JLT`, and `JLE` instructions are used for control flow, allowing the program to branch based on the values of the operands. The first bit in the subtype is used to negate the condition, so `JNE` is the negation of `JEQ`, and `JGE` is the negation of `JLT`. This allows for an easier implementation of control flow in hardware, as the negation can be done with a single bit flip.

All jump instructions will write `DEST` to the program counter (`r7`), which is the next instruction to execute. If they succeed, they will jump to the absolute address specified by `DEST`, which is an 8-bit unsigned integer. If the jump fails, the program will continue executing the next instruction in sequence.

## Design rationale/notes
- The ISA is designed to be simple and easy to understand, with a small set of instructions that can be used to perform a wide range of operations.
- The first bit in the subtype of `ALU` operations is used to indicate a related operation. For example, `ROR` and `ROL` are bitwise rotations, and are paired for symmetry, as is `ADD` and `SUB` Exception: `NOT` and `XOR` are paired as outliers.
- The `COND` operations are designed to be used for control flow, allowing the program to branch based on the values of the operands. The first bit in the subtype is used to negate the condition, so `JNE` is the negation of `JEQ`, and `JGE` is the negation of `JLT`. This allows for an easier implementation of control flow in hardware, as the negation can be done with a single bit flip.
- The `IO` operations are designed to be used for input/output and miscellaneous operations. The `MOV` and `SWAP` instructions are used to move data between registers, and the `PUSH` and `POP` instructions are used to manipulate the stack. The `WRT` instruction is used to write data to the terminal, and the `CALL` instruction is used to call subroutines. The `JRE` instruction is used to jump to a relative address, which is useful for implementing loops and other control flow structures. The `HCF` instruction is used to halt the program, which can be useful for debugging or when the program has finished executing.

## Registers

- `r0-r3` registers are general purpose, and can be the source or destination of any operation, for any purpose.  
- `r4` is the [RAM](#memory) address register, and is used to point to the current RAM address, along with:  
- `r5` is the [RAM](#memory) data register, which is used to read/write data from/to RAM.
- `r6` is reserved for future use, and should not be used in programs. Reads from `r6` will return `0x00`, and writes to `r6` will be ignored. This is undefined behavior, and should not be relied upon.
- `r7` is the program counter, which points to the next instruction to execute, and is used for `CALL` and `RET` operations.

The canonical register names are `r0`, `r1`, `r2`, `r3`, `r4`, `r5`, and `r7`.
- `r4` is also aliased to `RAMADDR`, and `r5` is aliased to `RAMDATA`.
- `r7` is also aliased to `PC` (program counter).

Register values are 8-bit unsigned integers, with values ranging from `0x00` to `0xFF`.
They can be used as the operands and/or destination of any operation, even in the same instruction.  
Thus, `AND, r0, r1, r0` is a valid instruction that performs a bitwise AND operation between the values in `r0` and `r1`, and stores the result back in `r0`.

Writes to `r7` WILL change the program counter, and thus the next instruction to execute.

When an instruction is executed, the program counter (`r7`) is automatically incremented by 1, so the next instruction will be executed in sequence.
Implementations should ensure that the storage medium used returns the next 32 bits/4 bytes of the program per 1 PC value. 
That is, the PC value indexes *instructions*, *NOT* bytes.

## Immediates

Immediates are 8-bit unsigned integers. Any instruction that has an immediate value will act exactly as if the immediate value was loaded into a register, and then used as an operand.
For example, the instruction `ADD r0, 0x01, r1` will add the value `0x01` to the value in `r0`, and store the result in `r1`
This is equivalent to the instruction  `ADD r0, r4, r1`, where `r4` is set to `0x01` before the instruction is executed.
Immediates can only be used as the first or second operand of an instruction, and cannot be used as the destination of an instruction.
If the operation does not use the second, the immediate bit is ignored, and should be set to `0`. The same applies to the first operand, which is ignored if the operation does not use it.



## Suggested Assembler Macros

The following macros are suggested to make programming in this ISA easier:
```assembly
ZERO reg:
      MOV 0x00, reg
INC reg:
      ADD reg, 0x01, reg
DEC reg:
      SUB reg, 0x01, reg
RET:
      POP r7

LOAD addr_reg, dest:
    MOV addr_reg, RAMVAL
    MOV RAMDATA, dest

STORE src, addr_reg:
    MOV addr_reg, RAMVAL
    MOV src, RAMDATA

SAVE val: 
   MOV RAMDATA, val
   ADD RAMVAL, 0x01, RAMVAL
```

## Recommended Assembler Behavior
The assembler SHOULD:
- Automatically fill in the immediate bits for instructions that require them, such as `MOV`, `ADD`, `SUB`, etc.
- Automatically fill in the immediate bits with `0` for instructions that do not use them, such as `NOP`, `HCF`, etc.
- If arguments are not provided and the instruction does not require them, the assembler SHOULD fill the arguments with `0` by default. For example, `MOV r0, r1` should be equivalent to `MOV r0, 0x00, r1`. In cases where this is ambiguous or impossible, the assembler SHOULD error out and warn the user.
- If DEST is not provided, the assembler SHOULD fill it with `r0` by default, and MUST warn the user during assembly. 



## Memory
The ISA has 256 bytes of RAM, which can be accessed using the `r4` and `r5` registers.
The memory is byte-addressable. `r5` is used to read/write data from/to RAM. `r4` is used to point to the current RAM address.
- Writing to memory can be done by *ANY* instruction that has `r5` as the destination, and reading from memory can be done by *ANY* instruction that has `r5` as the source. 
This is intentionally designed to be flexible, but it is powerful and should be used with care.
- The `r4` register is used to point to the current RAM address, and is used in conjunction with `r5` to read/write data from/to RAM.
- The memory is organized as a single contiguous block of 256 bytes, with addresses ranging from `0x00` to `0xFF`.
- The memory is initialized to zero on startup.

`RAMADDR` is not automatically incremented or decremented, so it must be manually updated to point to the next address when reading/writing data.


## Example Instructions

`ADD r0, r1, r2`  
This instruction adds the values in `r0` and `r1`, and stores the result in `r2`.  
Binary: `00000010 00000000 00000001 00000010`  
ADD is an ALU operation (`00` type + `010` subtype) so the opcode is `00000010`, and the operands are `r0`, `r1`, and `r2`, which are `00000000`, `00000001`, and `00000010` respectively.  

`AND r0, 0b01010101, r1`  
This instruction performs a bitwise AND operation between the value in `r0` and the immediate value `0b01010101`, and stores the result in `r1`.  
Binary: `00100000 01010101 00000000 00000001`  
AND is an ALU operation (`00` type + `001` subtype). As the second operand is an immediate, the opcode is `00100000` with the `2` bit set to indicate an immediate value. The operands are `r0`, `0b01010101`, and `r1`, which are `00000000`, `01010101`, and `00000001` respectively.

`JMP 0x10`  
This instruction jumps to the absolute address `0x10`.
Binary: `01000000 00010000 00000000 00000000`  
JMP is a conditional operation (`01` type + `000` subtype), so the opcode is `01000000`. The operands are `0x10` (which is an immediate), and the destination is `r0`, which is `00000000`. The first operand is the address to jump to, so it is `00010000`.

`SUB r0, 0x80, r1`  
This instruction subtracts the immediate value `0x80` from the value in `r0`, and stores the result in `r1`.  
Binary: `00100110 00000000 10000000 00000001`  
SUB is an ALU operation (`00` type + `110` subtype), so the opcode is `00100110`. The operands are `r0`, `0x80`, and `r1`, which are `00000000`, `10000000`, and `00000001` respectively. This will convert the value in `r0` to a signed integer in `r1`.

`XOR r0, 0x55, r0`  
This instruction performs a bitwise XOR operation between the value in `r0` and the immediate value `0x55`, and stores the result back in `r0`. 
Binary: `00100011 00000000 01010101 00000000`
XOR is an ALU operation (`00` type + `011` subtype), so the opcode is `00100011`. The operands are `r0`, `0x55`, and `r0`, which are `00000000`, `01010101`, and `00000000` respectively. This will perform a bitwise XOR operation between the value in `r0` and the immediate value `0x55`, and store the result back in `r0`.

