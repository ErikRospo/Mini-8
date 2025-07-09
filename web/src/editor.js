import { editor, languages } from "monaco-editor";
import { OPCODES, REGISTERS, encodeOpcode, handleShorthand } from "./assembler";
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
        insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: "Define a constant",
      });
      return { suggestions };
    },
  });

  languages.registerInlayHintsProvider("mini-8", {
    provideInlayHints: (model, range) => {
      const hints = [];
      const lines = model.getLinesContent();
      for (let i = range.startLineNumber - 1; i < range.endLineNumber; i++) {
        const line = lines[i];

        const instruction = line.match(/^\s*([A-Z]+)\b/);
        let isWRT = false;
        if (instruction) {
          const mnemonic = instruction[1];
          if (mnemonic === "WRT") {
            isWRT = true;
          }
        }
        //parse immediate values, and inlay the raw integer value
        const hexMatch = line.match(/0x([0-9a-fA-F]+)/);
        if (hexMatch) {
          const hexValue = parseInt(hexMatch[1], 16);
          if (hexValue < 10){
            // You can parse hex values up to 10, right?
            continue;
          }
          hints.push({
            position: {
              lineNumber: i + 1,
              column: hexMatch.index + hexMatch[0].length + 1,
            },
            label: `: ${hexValue.toString()}`,
            kind: languages.InlayHintKind.Parameter,
          });
        }
        const binMatch = line.match(/0b([01]+)/);
        if (binMatch) {
          const binValue = parseInt(binMatch[1], 2);
          if (isWRT && binValue < 4){
            //This is probably the second argument of a WRT instruction, the formatter. Instead of showing the raw value, we show the formatter name
            const formatters = ["utf", "dec","alph","hex"];
            const formatter= formatters[binValue];
            hints.push({
              position: {
                lineNumber: i + 1,
                column: binMatch.index + binMatch[0].length + 1,
              },
              label: `: ${formatter}`,
              kind: languages.InlayHintKind.Parameter,
            });
            continue;
          }
          if (binValue < 2) {
            // You can parse bin values up to 2, right?
            continue;
          }
          hints.push({
            position: {
              lineNumber: i + 1,
              column: binMatch.index + binMatch[0].length + 1,
            },
            label: `: ${binValue.toString()}`,
            kind: languages.InlayHintKind.Parameter,
          });
        }
        const charMatch = line.match(/"[^\"', ]"/);
        if (charMatch) {
          const charValue = charMatch[0].slice(1, -1); // Remove quotes
          hints.push({
            position: {
              lineNumber: i + 1,
              column: charMatch.index + 4,
            },
            label: `: ${charValue.charCodeAt(0).toString()}`,
            kind: languages.InlayHintKind.Parameter,
          });
        }
      }
      return { hints, dispose: () => {} };
    },
  });
}
