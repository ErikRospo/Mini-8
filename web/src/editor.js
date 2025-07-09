import { editor, languages } from "monaco-editor";
import { OPCODES, REGISTERS,encodeOpcode,handleShorthand } from "./assembler";
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
        [/\b(?:AND|ROR|ADD|XOR|OR|ROL|SUB|NOT)\b/, "keyword.alu"],

        // Conditional keywords
        [/\b(?:JMP|JNE|JGE|JGT|NOP|JEQ|JLT|JLE)\b/, "keyword.cond"],

        // IO keywords
        [/\b(?:MOV|SWAP|PUSH|POP|WRT|CALL|JRE|HCF)\b/, "keyword.io"],

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

        // Label references: $name
        [/\$\w+/, "identifier"],

        [/[,:]/, "delimiter"],
        [/\s+/, "white"],
      ],
    },
  });
  editor.defineTheme("darkgreen", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", fontStyle: "italic" },
      {
        token: "keyword",
        foreground: "#00BB00",
        fontStyle: "bold",
      },
      {
        token: "identifier",
        foreground: "#00BB88",
      },
      { token: "variable.predefined", foreground: "#5588BB" },
      { token: "string", foreground: "#5080FB" },
      { token: "number.binary", foreground: "#bbbbbb" },

      { token: "keyword.cond", foreground: "#88BB00" },
      { token: "keyword.io", foreground: "#00BB33" },
    ],
    colors: {
      "editor.foreground": "#00FF00", // Set foreground color to green
      "editor.background": "#000000", // Set background color to black
      "editor.lineHighlightBackground": "#333333", // Highlight current line
      "editorCursor.foreground": "#00FF00", // Cursor color
    },
  });

  languages.registerCompletionItemProvider("mini-8", {
    provideCompletionItems: () => {
      const suggestions = [];
      for (const [name, [opclass, code]] of Object.entries(OPCODES)) {
        suggestions.push({
          label: name,
          kind: languages.CompletionItemKind.Function,
          insertText: name,
          insertTextRules:
            languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: `Opcode ${name} (${opclass})`,
        });
      }
      for (const [name, index] of Object.entries(REGISTERS)) {
        suggestions.push({
          label: name,
          kind: languages.CompletionItemKind.Variable,
          insertText: name,
          insertTextRules:
            languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: `Register ${name} (R${index})`,
        });
      }
      suggestions.push({
        label: "define",
        kind: languages.CompletionItemKind.Keyword,
        insertText: "define ${1:name} ${2:value}",
        insertTextRules:
          languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: "Define a constant",
      });
      return { suggestions };
    },
  });

}
