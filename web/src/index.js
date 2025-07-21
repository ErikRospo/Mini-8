// MiniMachine Web UI Main Entry Point
// ------------------------------------
// Imports and Setup
import MiniMachineVM from "./vm.js";
import { assembleFromLines } from "./assembler.js";
import editorinit from "./editor.js";
import { editor } from "monaco-editor";
import * as monaco from "monaco-editor";

// DOM Elements
const playPauseBtn = document.getElementById("playPauseBtn");
const stepBtn = document.getElementById("stepBtn");
const assembleBtn = document.getElementById("assembleBtn");
const resetBtn = document.getElementById("reset");
const rawCodeInput = document.getElementById("rawCodeInput");
const disasmEl = document.getElementById("disasm");
const registersEl = document.getElementById("registers");
const documentationButton = document.getElementById("documentation");
const speedInput = document.getElementById("vmSpeed");
const outputEl = document.getElementById("output");
const inputEl = document.getElementById("inputEl");
const RAMEl = document.getElementById("ram");
const stackEl = document.getElementById("stack");
const selector = document.getElementById("demos");
const scrollPCCheckbox = document.getElementById("scrollPC");
const fileInput = document.getElementById("fileInput");
const loadBtn = document.getElementById("loadBtn");
const formatBtn = document.getElementById("formatBtn");
const disassembleBtn = document.getElementById("disassembleBtn");

// State
let interval = null;
/**
 * @type {MiniMachineVM}
 */
let vm = null; // MiniMachineVM instance
let lineToPCMap = {};
const previousRegs = {};

// Monaco Editor Setup
editorinit();
const assemblyEditor = editor.create(disasmEl, {
  value: localStorage.getItem("program") || "",
  language: "mini-8",
  automaticLayout: true,
  theme: "darkgreen",
  lineNumbers: linenumberFunc,
});
const assemblyModel = assemblyEditor.getModel();
const decorations = assemblyEditor.createDecorationsCollection();

// --- Utility Functions ---
function linenumberFunc(line) {
  if (line < 0) return 0;
  if (lineToPCMap[line - 1] === undefined) {
    return linenumberFunc(line - 1);
  }
  return (lineToPCMap[line - 1] || 0)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}
function toHex(byte) {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}
function printOutput(output) {
  outputEl.innerText += output;
}
function clearOutputError() {
  outputEl.innerText = "";
  outputEl.classList.remove("output-error");
}
function setOutputError(msg) {
  outputEl.innerText = msg;
  outputEl.classList.add("output-error");
}

// --- VM Control Functions ---
function startVMInterval(delay) {
  if (interval) clearInterval(interval);
  interval = setInterval(() => {
    vm.step();
    render();
    if (vm.halted) {
      clearInterval(interval);
      interval = null;
      playPauseBtn.textContent = "Play";
    }
  }, delay);
}
function loadVMFromRaw() {
  const bytes = rawCodeInput.value
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16) || 0);
  vm = new MiniMachineVM(new Uint8Array(bytes), { printOutput, outputEl });
  render();
}

// --- Disassembly and Editor Functions ---
function updateDisassembly(currentPC = null) {
  if (rawCodeInput.value.trim() === "") {
    setOutputError("No code to disassemble. Please enter some code.");
    return;
  }
  clearOutputError();
  const code = rawCodeInput.value
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16) || 0);
  if (!vm) {
    vm = new MiniMachineVM(new Uint8Array(code), { printOutput, outputEl });
  }
  let disassembly = "";
  for (let i = 0; i < code.length; i += 4) {
    const instruction = code.slice(i, i + 4);
    const disasmLine = vm.disassemble(
      instruction[0],
      instruction[1],
      instruction[2],
      instruction[3]
    );
    lineToPCMap[i / 4] = i / 4;
    disassembly += disasmLine + "\n";
  }
  assemblyEditor.setValue(disassembly);
}
function highlightCurrentPC(pc) {
  decorations.clear();
  if (pc === null || pc === undefined) return;
  const lines = [];
  let lastPC = 0;
  for (let line = 0; line < assemblyEditor.getModel().getLineCount(); line++) {
    let mappedPC;
    if (lineToPCMap[line] !== undefined) {
      mappedPC = lineToPCMap[line];
      lastPC = mappedPC;
    } else {
      mappedPC = lastPC;
    }
    if (mappedPC === pc) {
      lines.push(line + 1);
    }
  }
  if (lines.length === 0) return;
  const newDecorations = lines.map((lineNumber) => ({
    range: new monaco.Range(lineNumber, 1, lineNumber, 1),
    options: { isWholeLine: true, linesDecorationsClassName: "current-pc" },
  }));
  decorations.set(newDecorations);
  if (scrollPCCheckbox.checked) {
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    assemblyEditor.revealLinesInCenterIfOutsideViewport(
      firstLine,
      lastLine,
      monaco.editor.ScrollType.Smooth
    );
  }
}

// --- Rendering Functions ---
function render() {
  const names = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "PC"];
  registersEl.innerHTML = "";
  names.forEach((n, i) => {
    if (n === "r6") return;
    const val = vm ? vm.reg[i].toString(16).padStart(2, "0") : "00";
    const div = document.createElement("div");
    div.className = "register";
    // Register name (static)
    const nameSpan = document.createElement("span");
    nameSpan.textContent = `${n}: 0x`;
    // Register value (editable)
    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.value = val;
    valueInput.size = 2;
    valueInput.maxLength = 2;
    valueInput.className = "reg-value";
    valueInput.style.width = "2.5em";
    valueInput.style.textAlign = "right";
    valueInput.disabled = !vm;
    // Flash effect if changed
    if (previousRegs[n] !== val) {
      valueInput.classList.add("flash");
      setTimeout(() => valueInput.classList.remove("flash"), 300);
    }
    previousRegs[n] = val;
    // On change, update VM register
    valueInput.addEventListener("change", (e) => {
      if (!vm) return;
      let newVal = parseInt(e.target.value, 16);
      if (isNaN(newVal) || newVal < 0 || newVal > 0xff) {
        e.target.value = vm.reg[i].toString(16).padStart(2, "0");
        return;
      }
      vm.reg[i] = newVal;
      render();
    });
    div.appendChild(nameSpan);
    div.appendChild(valueInput);
    registersEl.appendChild(div);
  });
  RAMEl.innerText = vm ? vm.ram.map(toHex).join(" ") : "";
  stackEl.innerText = vm ? vm.stack.map(toHex).join(" ") : "";
  if (vm) highlightCurrentPC(vm.reg[7]);
}

// --- File and Demo Loading ---
function handleFileLoad(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "m8a" || ext === "txt") {
    // Assembly source file: load as text into editor
    const reader = new FileReader();
    reader.onload = function (evt) {
      const program = evt.target.result;
      assemblyEditor.setValue(program);
      vm = null;
      render();
      assemblyEditor.focus();
    };
    reader.readAsText(file);
  } else if (ext === "mi8" || ext === "bin") {
    // Compiled binary: load as hex into rawCodeInput
    const reader = new FileReader();
    reader.onload = function (evt) {
      const buffer = evt.target.result;
      const bytes = new Uint8Array(buffer);
      const text = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      rawCodeInput.value = text;
      vm = null;
      updateDisassembly(0);
    };
    reader.readAsArrayBuffer(file);
  } else {
    setOutputError("Unsupported file type: " + ext);
  }
}

// --- Event Listeners ---
selector.addEventListener("input", async () => {
  const value = selector.value;
  if (value) {
    const response = await fetch(`./demos/${value}.m8a`);
    if (!response.ok) {
      setOutputError(
        `Error loading demo "${value}": ${response.status} ${response.statusText}`
      );
      return;
    }
    clearOutputError();
    const program = await response.text();
    assemblyEditor.setValue(program);
    vm = null;
    render();
    assemblyEditor.focus();
  }
});
disassembleBtn.addEventListener("click", () => updateDisassembly());
playPauseBtn.addEventListener("click", () => {
  if (interval) {
    clearInterval(interval);
    interval = null;
    playPauseBtn.textContent = "Play";
  } else {
    if (!vm) loadVMFromRaw();
    const delay = parseInt(speedInput.value, 10) || 1000;
    startVMInterval(delay);
    playPauseBtn.textContent = "Pause";
  }
});
resetBtn.addEventListener("click", () => {
  vm = null;
  clearOutputError();
  RAMEl.innerText = "";
  stackEl.innerText = "";
  render();
});
speedInput.addEventListener("input", () => {
  if (interval) {
    const delay = parseInt(speedInput.value, 10) || 1000;
    startVMInterval(delay);
  }
});
loadBtn.addEventListener("click", () => fileInput.click());
assembleBtn.addEventListener("click", () => {
  try {
    let { hex, origLineToPc } = assembleFromLines(
      assemblyEditor.getValue().split("\n")
    );
    rawCodeInput.value = hex;
    lineToPCMap = origLineToPc;
    clearOutputError();
    vm = null;
  } catch (error) {
    setOutputError(error.message);
  }
});
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFileLoad(file);
});
stepBtn.addEventListener("click", () => {
  if (!vm) loadVMFromRaw();
  vm.step();
  render();
});
rawCodeInput.addEventListener("input", () => {
  vm = null;
  updateDisassembly(0);
});
rawCodeInput.addEventListener("dragover", (e) => {
  e.preventDefault();
  rawCodeInput.style.background = "#222";
});
rawCodeInput.addEventListener("dragleave", (e) => {
  e.preventDefault();
  rawCodeInput.style.background = "#000";
});
rawCodeInput.addEventListener("drop", (e) => {
  e.preventDefault();
  rawCodeInput.style.background = "#000";
  const file = e.dataTransfer.files[0];
  if (file) handleFileLoad(file);
});
formatBtn.addEventListener("click", () => {
  let hexStr = rawCodeInput.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  let bytes = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(hexStr.substr(i, 2));
  }
  let lines = [];
  for (let i = 0; i < bytes.length; i += 4) {
    lines.push(bytes.slice(i, i + 4).join(" "));
  }
  rawCodeInput.value = lines.join("\n");
});
documentationButton.addEventListener("click", () => {
  window.open("/Mini-8/ISA");
});
assemblyModel.onDidChangeContent(() => {
  localStorage.setItem("program", assemblyEditor.getValue());
});

inputEl.addEventListener("input", (e) => {
  console.log("Input event triggered");
  console.log(e.target.value);
  const val = e.target.value;
  if (val && vm) {
    vm.textBuffer.push(...val);
  }
  inputEl.value = "";
});

// --- Initialization ---
(function init() {
  try {
    lineToPCMap = assembleFromLines(
      assemblyEditor.getValue().split("\n")
    ).origLineToPc;
  } catch (error) {
    setOutputError(error.message);
    console.error("Error assembling initial code:", error);
  }

  render();
})();
