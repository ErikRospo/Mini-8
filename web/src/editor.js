import { editor, languages } from "monaco-editor";
export default function init_mini8() {
  languages.register({ id: "mini-8" });
  languages.setMonarchTokensProvider("mini-8", {
    defaultToken: "invalid",
    brackets: [],
    tokenizer: {
      root: [
        // Comments
        [/;.*/, "comment"],

        // Macro definitions (define ... end)
        [/\bdefine\b/, "keyword"],
        [/\bend\b/, "keyword"],

        // ALU keywords
        [/\b(?:AND|ROR|ADD|XOR|OR|ROL|SUB|NOT)\b/, "keyword"],

        // Conditional keywords
        [/\b(?:JMP|JNE|JGE|JGT|NOP|JEQ|JLT|JLE)\b/, "keyword"],

        // IO keywords
        [/\b(?:MOV|SWAP|PUSH|POP|WRT|CALL|JRE|HCF)\b/, "keyword"],

        // Registers
        [/\b(?:r[0-8]|PC|RAMADDR|RAMDATA)\b/, "variable.predefined"],

        // Macro/Function names (all-caps, underscores, numbers)
        [/\b[A-Z_][A-Z0-9_]*\b/, "type.identifier"],

        // label keyword
        [/\blabel\b/, "keyword"],

        // Hex numbers
        [/\b0x[0-9a-fA-F]+\b/, "number.hex"],

        // Binary numbers
        [/\b0b[01]+\b/, "number.binary"],

        // Decimal numbers
        [/\b\d+\b/, "number"],

        // Single quoted char
        [/'[^\s,"']'/, "string"],

        // Double quoted char
        [/\"[^\s,\"']\"/, "string"],

        // Label definitions: label $name:
        [/\blabel\s+\$\w+:/, "annotation"],

        // Label references: $name
        [/\$\w+/, "identifier"],

        // Macro parameters (inside define ... end)
        // Not handled separately, but could be added if needed

        // Fallback
        [/[ \t\r\n]+/, "white"],
      ],
    },
  });
  editor.defineTheme("darkgreen", {
    base: "hc-black",
    inherit: true,
    rules: [
      {
        token: "comment",
        foreground: "",
      },
    ],
  });
}
