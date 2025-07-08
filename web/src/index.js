import { MiniMachineVM } from "./vm.js";
import { assemble } from "./assembler.js";

let interval = null;
let vm = null;

let lineToPCMap = {};
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
if (localStorage.getItem("program") !== null) {
  disasmEl.innerHTML = localStorage.getItem("program");
}
window.addEventListener("onbeforeunload", () => {
  localStorage.setItem("program", disasmEl.innerHTML);
});
window.addEventListener("onreload", () => {
  localStorage.setItem("program", disasmEl.innerHTML);
});
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
    disasmEl.innerText = program;
    vm = null;
    render();
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
    lineToPCMap = assemble();
  } catch (error) {
    outputEl.innerText = error.message;
    outputEl.classList.add("output-error");
    return;
  }
  if (outputEl.classList.contains("output-error")) {
    outputEl.innerText = "";
    outputEl.classList.remove("output-error");
  }

  const disasmEl = document.getElementById("disasm");
  const lines = disasmEl.innerText.split("\n");
  disasmEl.innerHTML = "";
  let pc = 0;
  for (let i = 0; i < lines.length; i++) {
    pc = lineToPCMap[i] || pc;
    const lineEl = document.createElement("div");
    lineEl.className = "dis-line";
    lineEl.dataset.pc = fpc(pc);
    if (lines[i] === "") {
      continue;
    }
    lineEl.textContent = lines[i];
    lineEl.style = `--line-num:${pc}`;
    disasmEl.appendChild(lineEl);
  }
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
function fpc(pc) {
  return pc.toString(16).padStart(2, "0");
}
function updateDisassembly(currentPC = null) {
  const bytes = rawCodeInput.value
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16) || 0);

  disasmEl.innerHTML = "";

  let pc = 0;

  for (let i = 0; i + 3 < bytes.length; i += 4, pc++) {
    const instr = bytes.slice(i, i + 4);
    const dis = MiniMachineVM.prototype.disassemble(...instr);

    const lineEl = document.createElement("div");
    lineEl.className = "dis-line";
    lineEl.dataset.pc = fpc(pc);
    lineEl.textContent = dis;
    lineEl.style = `--line-num:${pc}`;

    disasmEl.appendChild(lineEl);
  }
}

function highlightCurrentPC(pc) {
  document
    .querySelectorAll(".current-pc")
    .forEach((el) => el.classList.remove("current-pc"));
  document
    .querySelectorAll(`[data-pc='${fpc(pc)}']`)
    .forEach((el) => el.classList.add("current-pc"));
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
