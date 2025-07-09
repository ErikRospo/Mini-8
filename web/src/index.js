import MiniMachineVM from "./vm.js";
import { assembleFromLines } from "./assembler.js";
import editorinit from "./editor.js";
import { editor } from "monaco-editor";
import * as monaco from "monaco-editor";
editorinit();
let interval = null;
/**
 * @type {MiniMachineVM|null}
 * The MiniMachineVM instance that runs the Mini-8 code.
 */
let vm = null;

let lineToPCMap = {};
/**
 * Convert a line number to its corresponding PC (program counter) value.
 * @param {number} line
 * @returns {string}
 */
function linenumberFunc(line) {
  // Convert line number to PC (program counter)
  if (line < 0) return 0;
  if (lineToPCMap[line - 1] === undefined) {
    // return ""
    return linenumberFunc(line - 1); // Fallback to previous line if not found
  }
  return (lineToPCMap[line - 1] || 0)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}
// Keep track of previous register values
const previousRegs = {};

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
const RAMEl = document.getElementById("ram");
const stackEl = document.getElementById("stack");
const selector = document.getElementById("demos");

const scrollPCCheckbox = document.getElementById("scrollPC");

const assemblyEditor = editor.create(disasmEl, {
  value: localStorage.getItem("program") || "",
  language: "mini-8",
  automaticLayout: true,
  theme: "darkgreen",
  lineNumbers: linenumberFunc,
});
lineToPCMap = assembleFromLines(
  assemblyEditor.getValue().split("\n")
).origLineToPc;
const assemblyModel = assemblyEditor.getModel();
assemblyModel.onDidChangeContent((e) => {
  localStorage.setItem("program", assemblyEditor.getValue());
  // Update the disassembly view
});
const decorations = assemblyEditor.createDecorationsCollection();
selector.addEventListener("input", async () => {
  const value = selector.value;
  if (value) {
    // Fetch and inject the demo content into the container
    const response = await fetch(`./demos/${value}.m8a`);
    if (!response.ok) {
      outputEl.innerText = `Error loading demo "${value}": ${response.status} ${response.statusText}`;
      outputEl.classList.add("output-error");
      return;
    }
    if (outputEl.classList.contains("output-error")) {
      outputEl.innerText = "";
      outputEl.classList.remove("output-error");
    }
    const program = await response.text();
    assemblyEditor.setValue(program);
    vm = null;
    render();
    assemblyEditor.focus();
  }
});
document.getElementById("disassembleBtn").addEventListener("click", () => {
  updateDisassembly();
});
render();
function printOutput(output) {
  outputEl.innerText += output;
}
documentationButton.addEventListener("click", () => {
  window.open("/Mini-8/ISA");
});
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
  if (vm) {
    vm = null;
  }
  outputEl.innerText = "";
  outputEl.classList.remove("output-error");
  RAMEl.innerText = "";
  stackEl.innerText = "";
  render();
});

// Change VM speed while running
speedInput.addEventListener("input", () => {
  if (interval) {
    const delay = parseInt(speedInput.value, 10) || 1000;
    startVMInterval(delay); // restart with new speed
  }
});

const fileInput = document.getElementById("fileInput");
const loadBtn = document.getElementById("loadBtn");

loadBtn.addEventListener("click", () => {
  fileInput.click();
});
assembleBtn.addEventListener("click", () => {
  try {
    let { hex, origLineToPc } = assembleFromLines(
      assemblyEditor.getValue().split("\n")
    );
    rawCodeInput.value = hex;
    lineToPCMap = origLineToPc;
  } catch (error) {
    outputEl.innerText = error.message;
    outputEl.classList.add("output-error");
    return;
  }
  if (outputEl.classList.contains("output-error")) {
    outputEl.innerText = "";
    outputEl.classList.remove("output-error");
  }
  vm = null; // Reset VM when code changes
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    const buffer = evt.target.result;
    // Convert ArrayBuffer to hex string
    const bytes = new Uint8Array(buffer);
    const text = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    rawCodeInput.value = text;
    vm = null;
    updateDisassembly(0);
  };
  reader.readAsArrayBuffer(file);
});
stepBtn.addEventListener("click", () => {
  if (!vm) loadVMFromRaw();
  vm.step();
  render();
});

rawCodeInput.addEventListener("input", () => {
  vm = null; // Reset VM when code changes
  updateDisassembly(0);
});
rawCodeInput.addEventListener("dragover", (e) => {
  e.preventDefault();
  rawCodeInput.style.background = "#222"; // Visual feedback
});

rawCodeInput.addEventListener("dragleave", (e) => {
  e.preventDefault();
  rawCodeInput.style.background = "#000";
});

rawCodeInput.addEventListener("drop", (e) => {
  e.preventDefault();
  rawCodeInput.style.background = "#000";
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    const buffer = evt.target.result;
    // Convert ArrayBuffer to hex string
    const bytes = new Uint8Array(buffer);
    const text = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    rawCodeInput.value = text;
    vm = null;
    updateDisassembly(0);
  };
  reader.readAsArrayBuffer(file);
});

const formatBtn = document.getElementById("formatBtn");
formatBtn.addEventListener("click", () => {
  // Remove all non-hex chars and condense to a single string
  let hexStr = rawCodeInput.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();

  // Split into 2-char bytes
  let bytes = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(hexStr.substr(i, 2));
  }

  // Format into lines of 4 bytes each
  let lines = [];
  for (let i = 0; i < bytes.length; i += 4) {
    lines.push(bytes.slice(i, i + 4).join(" "));
  }
  rawCodeInput.value = lines.join("\n");
});

function loadVMFromRaw() {
  const bytes = rawCodeInput.value
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16) || 0);
  vm = new MiniMachineVM(new Uint8Array(bytes), {
    printOutput,
    outputEl,
  });
  render();
}
function updateDisassembly(currentPC = null) {
  // Get the code from the Monaco editor
  const code = rawCodeInput.value
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16) || 0);
  if (!vm) {
    vm = new MiniMachineVM(new Uint8Array(code), {
      printOutput,
      outputEl,
    });
  }
  let disassembly = "";
  let disasmLine = "";
  for (let i = 0; i < code.length; i += 4) {
    const instruction = code.slice(i, i + 4);
    disasmLine = vm.disassemble(
      instruction[0],
      instruction[1],
      instruction[2],
      instruction[3]
    );
    lineToPCMap[i / 4] = i / 4; // Map line number to PC
    disassembly += disasmLine + "\n";
  }
  assemblyEditor.setValue(disassembly);
}
function highlightCurrentPC(pc) {
  // Remove previous decorations
  decorations.clear();

  if (pc === null || pc === undefined) return; // No PC to highlight

  // Find all line numbers whose mapped PC (using linenumberFunc logic) matches the current PC
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
      lines.push(line + 1); // Monaco lines are 1-based
    }
  }

  if (lines.length === 0) return;

  // Create decorations for each matching line
  const newDecorations = lines.map((lineNumber) => ({
    range: new monaco.Range(lineNumber, 1, lineNumber, 1),
    options: { isWholeLine: true, linesDecorationsClassName: "current-pc" },
  }));

  decorations.set(newDecorations);

  if (scrollPCCheckbox.checked) {
    // Scroll to the first highlighted line
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    assemblyEditor.revealLinesInCenterIfOutsideViewport(
      firstLine,
      lastLine,
      monaco.editor.ScrollType.Smooth
    );
  }
}

function render() {
  const names = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "PC"];
  registersEl.innerHTML = "";

  names.forEach((n, i) => {
    if (n === "r6") return;

    const val = vm ? vm.reg[i].toString(16).padStart(2, "0") : "00";
    const div = document.createElement("div");
    div.className = "register";
    div.textContent = `${n}: 0x${val}`;

    // Compare to previous value and flash if changed
    if (previousRegs[n] !== val) {
      div.classList.add("flash");
      setTimeout(() => div.classList.remove("flash"), 300);
    }

    previousRegs[n] = val;
    registersEl.appendChild(div);
  });
  // Function to convert a number to a 2-digit hex string
  function toHex(byte) {
    return byte.toString(16).toUpperCase().padStart(2, "0");
  }

  // Update RAMEl with hex pairs from vm.ram
  RAMEl.innerText = vm ? vm.ram.map(toHex).join(" ") : "";

  // Update stackEl with hex pairs from vm.stack
  stackEl.innerText = vm ? vm.stack.map(toHex).join(" ") : "";

  if (vm) highlightCurrentPC(vm.reg[7]);
}

render();
