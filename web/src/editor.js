import { editor, languages } from "monaco-editor";
import { OPCLASS, OPCODES, REGISTERS } from "./assembler";

// --- Constants ---
const MINI8_LANGUAGE_ID = "mini-8";
const FORMATTERS = ["utf", "dec", "alph", "hex"];
const THEME_NAME = "darkgreen";
const THEME_RULES = [
  { token: "comment", fontStyle: "italic" },
  { token: "keyword", foreground: "#00BB00", fontStyle: "bold" },
  { token: "identifier", foreground: "#00BB88" },
  { token: "variable.predefined", foreground: "#5588BB" },
  { token: "string", foreground: "#5080FB" },
  { token: "number.binary", foreground: "#bbbbbb" },
  { token: "keyword.cond", foreground: "#88BB00" },
  { token: "keyword.io", foreground: "#00BB33" },
];
// --- Theme Colors ---
const THEME_COLORS = {
  "editor.foreground": "#00FF00",
  "editor.background": "#000000",
  "editor.lineHighlightBackground": "#333333",
  "editorCursor.foreground": "#00FF00",
  "editorInlayHint.background": "#000000",
  "editorInlayHint.foreground": "#006000",
};

// --- Language Definition ---
function registerMini8Language() {
  languages.register({ id: MINI8_LANGUAGE_ID });
  languages.setMonarchTokensProvider(MINI8_LANGUAGE_ID, {
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
}

// --- Theme Definition ---
function defineMini8Theme() {
  editor.defineTheme(THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: THEME_RULES,
    colors: THEME_COLORS,
  });
}

// --- Completion Provider ---
function registerMini8CompletionProvider() {
  languages.registerCompletionItemProvider(MINI8_LANGUAGE_ID, {
    provideCompletionItems: () => {
      const suggestions = [];
      for (const [name, [opclass]] of Object.entries(OPCODES)) {
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
}

// --- Hover Provider ---
function registerMini8HoverProvider() {
  languages.registerHoverProvider(MINI8_LANGUAGE_ID, {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const token = word.word.toUpperCase();
      if (OPCODES[token]) {
        const [opclass, code] = OPCODES[token];
        const codeval = (code | (OPCLASS[opclass] << 3))
          .toString(2)
          .padStart(8, "0")
          .toUpperCase();
        return {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          },
          contents: [
            { value: `**Opcode:** ${token}` },
            { value: `**Class:** ${opclass}` },
            { value: `**Code:** ${codeval}` },
            { value: `**Mnemonic:** ${token} (${opclass})` },
          ],
        };
      }
    },
  });
}

// --- Inlay Hints Provider ---
function parseHexHint(line, isWRT, i, hexMatch) {
  const hexValue = parseInt(hexMatch[1], 16);
  if (isWRT && hexValue >= 0x20 && hexValue <= 0x7e) {
    return {
      position: {
        lineNumber: i + 1,
        column: hexMatch.index + hexMatch[0].length + 1,
      },
      label: `: ${String.fromCharCode(hexValue)}`,
      kind: languages.InlayHintKind.Parameter,
    };
  }
  if (hexValue === 10) {
    return {
      position: {
        lineNumber: i + 1,
        column: hexMatch.index + hexMatch[0].length + 1,
      },
      label: `: \\n`,
      kind: languages.InlayHintKind.Parameter,
    };
  }
  if (hexValue < 10) return null;
  return {
    position: {
      lineNumber: i + 1,
      column: hexMatch.index + hexMatch[0].length + 1,
    },
    label: `: ${hexValue.toString()}`,
    kind: languages.InlayHintKind.Parameter,
  };
}
function parseBinHint(line, isWRT, i, binMatch) {
  const binValue = parseInt(binMatch[1], 2);
  if (isWRT && binValue < 4) {
    return {
      position: {
        lineNumber: i + 1,
        column: binMatch.index + binMatch[0].length + 1,
      },
      label: `: ${FORMATTERS[binValue]}`,
      kind: languages.InlayHintKind.Parameter,
    };
  }
  if (binValue < 2) return null;
  return {
    position: {
      lineNumber: i + 1,
      column: binMatch.index + binMatch[0].length + 1,
    },
    label: `: ${binValue.toString()}`,
    kind: languages.InlayHintKind.Parameter,
  };
}
function parseCharHint(line, i, charMatch) {
  const charValue = charMatch[0].slice(1, -1);
  return {
    position: { lineNumber: i + 1, column: charMatch.index + 4 },
    label: `: ${charValue.charCodeAt(0).toString()}`,
    kind: languages.InlayHintKind.Parameter,
  };
}
function registerMini8InlayHintsProvider() {
  languages.registerInlayHintsProvider(MINI8_LANGUAGE_ID, {
    provideInlayHints: (model, range) => {
      const hints = [];
      const lines = model.getLinesContent();
      for (let i = range.startLineNumber - 1; i < range.endLineNumber; i++) {
        const line = lines[i];
        const instruction = line.match(/^\s*([A-Z]+)/);
        const isWRT = instruction && instruction[1] === "WRT";
        const hexMatch = line.match(/0x([0-9a-fA-F]+)/);
        if (hexMatch) {
          const hint = parseHexHint(line, isWRT, i, hexMatch);
          if (hint) {
            hints.push(hint);
            continue;
          }
        }
        const binMatch = line.match(/0b([01]+)/);
        if (binMatch) {
          const hint = parseBinHint(line, isWRT, i, binMatch);
          if (hint) {
            hints.push(hint);
            continue;
          }
        }
        const charMatch = line.match(/"[^\"', ]"/);
        if (charMatch) {
          hints.push(parseCharHint(line, i, charMatch));
        }
      }
      return { hints, dispose: () => {} };
    },
  });
}

// --- Main Initialization ---
export default function init_mini8() {
  registerMini8Language();
  defineMini8Theme();
  registerMini8CompletionProvider();
  registerMini8HoverProvider();
  registerMini8InlayHintsProvider();
}
