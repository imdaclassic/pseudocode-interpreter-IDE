import { createEditor } from "./editor.js";
import { Workspace, isCodeFile, baseName, dirName, joinPath, validateName, validateWorkspaceName, DEFAULT_NAME } from "./workspace.js";
import { Console } from "./console.js";
import { EXAMPLES } from "./examples.js";
import { renderReference } from "./reference.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ---------- workspace ----------
function seed(ws, data) {
  for (const e of EXAMPLES) {
    data.files[e.path] = { content: e.content, mode: e.mode };
    const dir = dirName(e.path);
    if (dir) {
      const parts = dir.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const p = parts.slice(0, i).join("/");
        if (!data.folders.includes(p)) data.folders.push(p);
      }
    }
  }
  data.expanded = { examples: true, "examples/igcse": true };
  data.open = ["main.pseudo"];
  data.active = "main.pseudo";
  data.mode = "igcse";
}

const ws = new Workspace(seed);
const con = new Console($("console"));
ws.onSaveError = () => con.system("Could not save to browser storage (it may be full). Export your workspace to keep a copy.");
let lastCodePath = ws.data.active && isCodeFile(ws.data.active) ? ws.data.active : ws.data.open.find(isCodeFile) || null;

// ---------- editor ----------
const editor = createEditor({
  parent: $("editor"),
  getMode: () => currentMode(),
  onRun: () => runProgram(),
  onSave: () => { ws.save(true); setStatus("Saved", ""); },
  onChange: (path, text) => ws.write(path, text, { silent: true }),
});

const emptyMsg = document.createElement("div");
emptyMsg.className = "empty-editor";
emptyMsg.textContent = "No file open. Pick one from Files or create a new one.";
$("editor").appendChild(emptyMsg);

function currentMode() {
  const p = ws.data.active && isCodeFile(ws.data.active) ? ws.data.active : lastCodePath;
  return p ? ws.modeOf(p) : ws.data.mode || "igcse";
}

function openFile(path) {
  if (!ws.exists(path)) return;
  if (!ws.data.open.includes(path)) ws.data.open.push(path);
  ws.data.active = path;
  if (isCodeFile(path)) lastCodePath = path;
  // Make sure the file is visible in the tree.
  for (let d = dirName(path); d; d = dirName(d)) ws.data.expanded[d] = true;
  editor.open(path, ws.read(path), isCodeFile(path));
  ws.save();
  renderAll();
  $("sidebar").classList.remove("open");
}

// Makes sure something is open in the editor so there's never a blank screen:
// prefers main.pseudo, then the first program, then any file; if the workspace
// is empty, creates a new main.pseudo.
const STARTER = "// Write your pseudocode here, then press Run (Ctrl+Enter).\n";
function ensureOpenFile() {
  if (ws.data.active && ws.exists(ws.data.active)) return openFile(ws.data.active);
  const all = Object.keys(ws.files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const pick = ws.exists("main.pseudo") ? "main.pseudo" : all.find(isCodeFile) || all[0];
  if (pick) return openFile(pick);
  ws.write("main.pseudo", STARTER);
  openFile("main.pseudo");
}

function closeTab(path) {
  const i = ws.data.open.indexOf(path);
  if (i < 0) return;
  ws.data.open.splice(i, 1);
  editor.close(path);
  if (ws.data.active === path) {
    const next = ws.data.open[Math.min(i, ws.data.open.length - 1)];
    ws.data.active = null;
    if (next) { openFile(next); return; }
  }
  ws.save();
  renderAll();
}

// ---------- rendering ----------
const ICON = {
  chevronR: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
  chevronD: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
  code: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>',
  file: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3.5 1.5h6l3 3v10h-9z" stroke="currentColor" fill="none"/><path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor"/></svg>',
  more: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="13" cy="8" r="1.2" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 16 16" width="10" height="10"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.6"/></svg>',
};

function renderTree() {
  const tree = $("tree");
  const frag = document.createDocumentFragment();
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      const el = document.createElement("div");
      el.className = "node" + (n.path === ws.data.active ? " active" : "");
      el.dataset.path = n.path;
      el.dataset.type = n.type;
      el.draggable = true;
      el.setAttribute("role", "treeitem");
      el.style.paddingLeft = `${8 + depth * 14}px`;
      const open = n.type === "folder" && ws.data.expanded[n.path];
      if (n.type === "folder") el.setAttribute("aria-expanded", String(!!open));
      const icon = n.type === "folder" ? (open ? ICON.chevronD : ICON.chevronR) : isCodeFile(n.path) ? ICON.code : ICON.file;
      const tag = n.type === "file" && isCodeFile(n.path) && ws.modeOf(n.path) === "as" ? '<span class="tag" title="AS & A Level">AS</span>' : "";
      el.innerHTML = `<span class="ico">${icon}</span><span class="name"></span>${tag}<button class="icon-btn sm more" title="Actions" aria-label="Actions">${ICON.more}</button>`;
      el.querySelector(".name").textContent = n.name;
      el.title = n.path;
      frag.appendChild(el);
      if (open) walk(n.children, depth + 1);
    }
  };
  walk(ws.tree(), 0);
  tree.replaceChildren(frag);
}

function renderTabs() {
  const tabs = $("tabs");
  tabs.replaceChildren(
    ...ws.data.open.map((p) => {
      const t = document.createElement("div");
      t.className = "tab" + (p === ws.data.active ? " active" : "");
      t.dataset.path = p;
      t.title = p;
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", String(p === ws.data.active));
      const name = document.createElement("span");
      name.textContent = baseName(p);
      const x = document.createElement("button");
      x.className = "x";
      x.title = "Close";
      x.setAttribute("aria-label", `Close ${baseName(p)}`);
      x.innerHTML = ICON.x;
      t.append(name, x);
      return t;
    })
  );
  tabs.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function renderMode() {
  const mode = currentMode();
  for (const b of $("mode").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  $("ref-mode").textContent = mode === "as" ? "AS & A Level" : "IGCSE";
  if (!$("refpanel").hidden) renderRef();
}

function renderAll() {
  renderTree();
  renderTabs();
  renderMode();
  const active = ws.data.active;
  $("ws-title").textContent = ws.name;
  $("ws-name").title = `Workspace: ${ws.name} (click to rename)`;
  $("file-name").textContent = active || "";
  emptyMsg.hidden = !!active;
  document.title = active ? `${baseName(active)} - Pseudocode IDE` : "Pseudocode IDE";
}

function renderRef() {
  renderReference($("ref-body"), currentMode(), $("ref-search").value, (code) => {
    if (!ws.data.active) return;
    editor.insert(code);
  });
}

ws.on(() => { renderTree(); renderTabs(); });

// ---------- tree interaction ----------
$("tree").addEventListener("click", (e) => {
  const node = e.target.closest(".node");
  if (!node) return;
  if (e.target.closest(".more")) {
    e.stopPropagation();
    const r = e.target.closest(".more").getBoundingClientRect();
    showNodeMenu(node.dataset.path, node.dataset.type, r.left, r.bottom);
    return;
  }
  if (node.dataset.type === "folder") {
    ws.data.expanded[node.dataset.path] = !ws.data.expanded[node.dataset.path];
    ws.save();
    renderTree();
  } else openFile(node.dataset.path);
});
$("tree").addEventListener("contextmenu", (e) => {
  const node = e.target.closest(".node");
  e.preventDefault();
  if (node) showNodeMenu(node.dataset.path, node.dataset.type, e.clientX, e.clientY);
  else showWorkspaceMenu(e.clientX, e.clientY);
});
$("tree").addEventListener("keydown", (e) => {
  const nodes = [...$("tree").querySelectorAll(".node")];
  if (!nodes.length) return;
  let i = nodes.findIndex((n) => n.classList.contains("kb"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    nodes[i]?.classList.remove("kb");
    i = e.key === "ArrowDown" ? Math.min(nodes.length - 1, i + 1) : Math.max(0, i - 1);
    nodes[i].classList.add("kb", "active");
    nodes.forEach((n, k) => k !== i && n.classList.remove("active"));
    nodes[i].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && i >= 0) {
    nodes[i].click();
  } else if (e.key === "F2" && i >= 0) {
    renamePath(nodes[i].dataset.path);
  } else if (e.key === "Delete" && i >= 0) {
    deletePath(nodes[i].dataset.path);
  }
});

// drag & drop: move within tree, or upload from the OS
let dragPath = null;
$("tree").addEventListener("dragstart", (e) => {
  const node = e.target.closest(".node");
  if (!node) return;
  dragPath = node.dataset.path;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragPath);
});
$("tree").addEventListener("dragend", () => { dragPath = null; clearDrop(); });
function dropTarget(e) {
  const node = e.target.closest(".node");
  if (!node) return "";
  return node.dataset.type === "folder" ? node.dataset.path : dirName(node.dataset.path);
}
function clearDrop() { $("tree").querySelectorAll(".drop").forEach((n) => n.classList.remove("drop")); $("tree").classList.remove("drop"); }
$("tree").addEventListener("dragover", (e) => {
  e.preventDefault();
  clearDrop();
  const dir = dropTarget(e);
  const el = dir ? $("tree").querySelector(`.node[data-path="${CSS.escape(dir)}"]`) : null;
  (el || $("tree")).classList.add("drop");
});
$("tree").addEventListener("dragleave", (e) => { if (!$("tree").contains(e.relatedTarget)) clearDrop(); });
$("tree").addEventListener("drop", async (e) => {
  e.preventDefault();
  clearDrop();
  const dir = dropTarget(e);
  if (e.dataTransfer.files.length && !dragPath) {
    await uploadFiles(e.dataTransfer.files, dir);
    return;
  }
  if (!dragPath) return;
  const to = joinPath(dir, baseName(dragPath));
  if (to === dragPath || dir === dragPath || dir.startsWith(dragPath + "/")) return;
  try {
    const moved = ws.move(dragPath, to);
    for (const [a, b] of moved) editor.rename(a, b);
    if (dir) ws.data.expanded[dir] = true;
    renderAll();
  } catch (err) {
    con.system(err.message);
  }
});

// ---------- tabs ----------
$("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  if (e.target.closest(".x")) closeTab(tab.dataset.path);
  else openFile(tab.dataset.path);
});
$("tabs").addEventListener("auxclick", (e) => {
  const tab = e.target.closest(".tab");
  if (tab && e.button === 1) closeTab(tab.dataset.path);
});

// ---------- menus ----------
const menu = $("menu");
function showMenu(items, x, y) {
  menu.replaceChildren(
    ...items.map((it) => {
      if (it === "-") return document.createElement("hr");
      const b = document.createElement("button");
      b.textContent = it.label;
      if (it.danger) b.className = "danger";
      b.addEventListener("click", () => { hideMenu(); it.run(); });
      return b;
    })
  );
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
  menu.querySelector("button")?.focus();
}
function hideMenu() { menu.hidden = true; }
document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); });

function showNodeMenu(path, type, x, y) {
  if (type === "folder") {
    showMenu([
      { label: "New file", run: () => newFile(path) },
      { label: "New folder", run: () => newFolder(path) },
      { label: "Upload files here", run: () => pickUpload(path) },
      "-",
      { label: "Rename", run: () => renamePath(path) },
      { label: "Delete folder", danger: true, run: () => deletePath(path) },
    ], x, y);
  } else {
    showMenu([
      { label: "Open", run: () => openFile(path) },
      { label: "Rename", run: () => renamePath(path) },
      { label: "Duplicate", run: () => duplicate(path) },
      { label: "Download", run: () => download(baseName(path), ws.read(path)) },
      "-",
      { label: "Delete", danger: true, run: () => deletePath(path) },
    ], x, y);
  }
}

function showWorkspaceMenu(x, y) {
  showMenu([
    { label: "New file", run: () => newFile("") },
    { label: "New folder", run: () => newFolder("") },
    { label: "Upload files", run: () => pickUpload("") },
    "-",
    { label: "Rename workspace", run: renameWorkspace },
    { label: "Save workspace", run: saveWorkspace },
    { label: "Load workspace (replace)", run: () => pickWorkspaceFile("replace") },
    { label: "Add files from a saved workspace", run: () => pickWorkspaceFile("merge") },
    { label: "Restore example files", run: restoreExamples },
    "-",
    { label: "Clear workspace", danger: true, run: deleteAll },
  ], x, y);
}

// ---------- dialogs ----------
function ask({ label, value = "", ok = "OK", validate, select }) {
  return new Promise((resolve) => {
    const dlg = $("dialog"), form = $("dialog-form"), input = $("dialog-input"), msg = $("dialog-msg");
    $("dialog-label").textContent = label;
    $("dialog-ok").textContent = ok;
    $("dialog-ok").className = "btn primary";
    input.hidden = false;
    input.value = value;
    msg.textContent = "";
    dlg.hidden = false;
    input.focus();
    if (select) input.setSelectionRange(select[0], select[1]);
    else input.select();
    const finish = (v) => {
      dlg.hidden = true;
      form.onsubmit = null;
      $("dialog-cancel").onclick = null;
      dlg.onkeydown = null;
      resolve(v);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      const problem = validate?.(v);
      if (problem) { msg.textContent = problem; return; }
      finish(v);
    };
    $("dialog-cancel").onclick = () => finish(null);
    dlg.onkeydown = (e) => { if (e.key === "Escape") finish(null); };
  });
}

function confirmBox(label, ok = "Delete") {
  return new Promise((resolve) => {
    const dlg = $("dialog"), form = $("dialog-form");
    $("dialog-label").textContent = label;
    $("dialog-ok").textContent = ok;
    $("dialog-ok").className = "btn primary";
    $("dialog-input").hidden = true;
    $("dialog-msg").textContent = "";
    dlg.hidden = false;
    $("dialog-ok").focus();
    const finish = (v) => {
      dlg.hidden = true;
      form.onsubmit = null;
      $("dialog-cancel").onclick = null;
      dlg.onkeydown = null;
      resolve(v);
    };
    form.onsubmit = (e) => { e.preventDefault(); finish(true); };
    $("dialog-cancel").onclick = () => finish(false);
    dlg.onkeydown = (e) => { if (e.key === "Escape") finish(false); };
  });
}

// ---------- file actions ----------
const nameCheck = (dir) => (v) => {
  const bad = validateName(v);
  if (bad) return bad;
  const p = joinPath(dir, v);
  if (ws.exists(p) || ws.isFolder(p)) return "A file or folder with that name already exists";
  return null;
};

async function newFile(dir) {
  const name = await ask({
    label: `New file${dir ? ` in ${dir}` : ""} (.pseudo for code, .txt for data)`,
    value: "untitled.pseudo",
    ok: "Create",
    select: [0, 8],
    validate: (v) => nameCheck(dir)(/\.\w+$/.test(v) ? v : v + ".pseudo"),
  });
  if (!name) return;
  const path = joinPath(dir, /\.\w+$/.test(name) ? name : name + ".pseudo");
  ws.createFile(path, "");
  if (dir) ws.data.expanded[dir] = true;
  openFile(path);
  editor.focus();
}

async function newFolder(dir) {
  const name = await ask({ label: `New folder${dir ? ` in ${dir}` : ""}`, value: "", ok: "Create", validate: nameCheck(dir) });
  if (!name) return;
  ws.createFolder(joinPath(dir, name));
  if (dir) ws.data.expanded[dir] = true;
  renderTree();
}

async function renamePath(path) {
  const dir = dirName(path), old = baseName(path);
  const dot = old.lastIndexOf(".");
  const name = await ask({
    label: `Rename ${old}`,
    value: old,
    ok: "Rename",
    select: [0, dot > 0 && !ws.isFolder(path) ? dot : old.length],
    validate: (v) => (v === old ? null : nameCheck(dir)(v)),
  });
  if (!name || name === old) return;
  const moved = ws.move(path, joinPath(dir, name));
  for (const [a, b] of moved) editor.rename(a, b);
  if (lastCodePath && moved.has(lastCodePath)) lastCodePath = moved.get(lastCodePath);
  if (ws.data.active && moved.has(path) && !isCodeFile(path) !== !isCodeFile(moved.get(path))) {
    // Extension changed between code and data: reopen with the right editor mode.
    const p = moved.get(path);
    editor.close(p);
    if (ws.data.active === p) openFile(p);
  }
  renderAll();
}

async function duplicate(path) {
  const copy = ws.uniquePath(dirName(path), baseName(path));
  ws.write(copy, ws.read(path));
  if (isCodeFile(path)) ws.files[copy].mode = ws.modeOf(path);
  openFile(copy);
}

async function deletePath(path) {
  const isFolder = ws.isFolder(path);
  const ok = await confirmBox(isFolder ? `Delete folder "${path}" and everything in it?` : `Delete "${path}"?`);
  if (!ok) return;
  const removed = ws.remove(path);
  for (const p of removed) editor.close(p);
  if (removed.includes(lastCodePath)) lastCodePath = null;
  ensureOpenFile();
}

async function deleteAll() {
  const ok = await confirmBox("Clear the workspace? Every file will be deleted. Use Save first if you want a copy.", "Clear");
  if (!ok) return;
  for (const p of [...ws.data.open]) editor.close(p);
  ws.data.files = {};
  ws.data.folders = [];
  ws.data.open = [];
  ws.data.active = null;
  ws.data.name = DEFAULT_NAME;
  lastCodePath = null;
  ensureOpenFile();
  ws.save(true);
  con.clear();
  con.system("Workspace cleared. Started a new main.pseudo.");
  editor.focus();
}

// Saved workspaces use their own extension; older .json saves still load.
const WS_EXT = ".pseudows";

async function renameWorkspace() {
  const name = await ask({ label: "Workspace name", value: ws.name, ok: "Rename", validate: validateWorkspaceName });
  if (!name || name === ws.name) return;
  ws.rename(name);
  renderAll();
}

function saveWorkspace() {
  // File name follows the workspace name, minus characters not allowed in file names.
  const safe = ws.name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "workspace";
  const name = `${safe}${WS_EXT}`;
  ws.save(true);
  download(name, ws.exportJSON(), "application/octet-stream");
  const n = Object.keys(ws.files).length;
  con.system(`Saved ${n} file${n === 1 ? "" : "s"} to ${name} (check your Downloads folder). Use Load to open it again.`);
}

// Loads a saved workspace file. replace: swap out the current files; otherwise add alongside.
async function loadWorkspaceFile(f, replace) {
  try {
    const text = await f.text();
    // Check it's a real workspace before asking anything or touching current files.
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!data || typeof data.files !== "object" || Array.isArray(data.files)) {
      throw new Error(`"${f.name}" is not a saved workspace. Choose a ${WS_EXT} file made with Save`);
    }
    if (replace) {
      const hasFiles = Object.keys(ws.files).length > 0;
      if (hasFiles && !(await confirmBox(`Load "${f.name}"? Your current files will be replaced. Use Save first if you want to keep them.`, "Load"))) return;
      for (const p of [...ws.data.open]) editor.close(p);
      lastCodePath = null;
    }
    const n = ws.importJSON(text, { replace, fallbackName: f.name.replace(/\.(pseudows|json)$/i, "") });
    con.system(`${replace ? "Loaded" : "Added"} ${n} file${n === 1 ? "" : "s"} from ${f.name}.`);
    if (replace) {
      for (const folder of ws.data.folders) if (!folder.includes("/")) ws.data.expanded[folder] = true;
    }
  } catch (err) {
    con.system(`${replace ? "Load" : "Import"} failed: ${err.message}`);
  }
  ensureOpenFile();
}

// "replace" for Load (swap in a saved workspace), "merge" for Import (add files alongside).
let importMode = "merge";
function pickWorkspaceFile(mode) {
  importMode = mode;
  $("import-input").value = "";
  $("import-input").click();
}

function restoreExamples() {
  let added = 0;
  for (const e of EXAMPLES) {
    if (ws.exists(e.path)) continue;
    ws.write(e.path, e.content);
    if (e.mode) ws.files[e.path].mode = e.mode;
    added++;
  }
  ws.data.expanded.examples = true;
  ws.save();
  renderAll();
  con.system(added ? `Restored ${added} example file${added === 1 ? "" : "s"}.` : "All example files are already there.");
}

function download(name, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let uploadDir = "";
function pickUpload(dir) {
  uploadDir = dir;
  $("upload-input").value = "";
  $("upload-input").click();
}
async function uploadFiles(fileList, dir) {
  let firstCode = null;
  // A dropped/uploaded saved workspace is loaded rather than added as a plain file.
  const wsFile = [...fileList].find((f) => /\.pseudows$/i.test(f.name));
  if (wsFile) { await loadWorkspaceFile(wsFile, true); return; }
  for (const f of fileList) {
    if (f.size > 2_000_000) { con.system(`Skipped ${f.name}: larger than 2 MB`); continue; }
    const text = await f.text();
    const path = ws.uniquePath(dir, f.name.replace(/[\\/:*?"<>|]/g, "_"));
    ws.write(path, text);
    if (!firstCode && isCodeFile(path)) firstCode = path;
  }
  if (dir) ws.data.expanded[dir] = true;
  if (firstCode) openFile(firstCode);
  else renderAll();
}
$("upload-input").addEventListener("change", (e) => uploadFiles(e.target.files, uploadDir));
$("import-input").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) await loadWorkspaceFile(f, importMode === "replace");
});

$("ws-name").addEventListener("click", renameWorkspace);
$("ws-save").addEventListener("click", saveWorkspace);
$("ws-load").addEventListener("click", () => pickWorkspaceFile("replace"));
$("ws-clear").addEventListener("click", deleteAll);

$("new-file").addEventListener("click", () => newFile(""));
$("new-folder").addEventListener("click", () => newFolder(""));
$("upload").addEventListener("click", () => pickUpload(""));
$("ws-menu-btn").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  showWorkspaceMenu(r.left, r.bottom + 2);
});

// ---------- mode ----------
$("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b) return;
  const target = ws.data.active && isCodeFile(ws.data.active) ? ws.data.active : lastCodePath;
  ws.setMode(target, b.dataset.mode);
  renderMode();
  renderTree();
  editor.relint();
});

// ---------- running ----------
let spare = null;
let running = null;
const newWorker = () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
function takeWorker() {
  const w = spare || newWorker();
  spare = null;
  return w;
}
function warm() { if (!spare) spare = newWorker(); }

function setStatus(text, cls) {
  const s = $("status");
  s.textContent = text;
  s.className = "status" + (cls ? " " + cls : "");
}

function setRunning(on) {
  $("run").hidden = on;
  $("stop").hidden = !on;
}

function runProgram() {
  if (running) return;
  const path = ws.data.active && isCodeFile(ws.data.active) ? ws.data.active : lastCodePath;
  if (!path || !ws.exists(path)) {
    con.clear();
    con.system("Open a .pseudo file to run it.");
    return;
  }
  lastCodePath = path;
  ws.save(true);
  con.clear();
  const mode = ws.modeOf(path);
  setStatus(`Running ${baseName(path)}…`, "");
  setRunning(true);
  const worker = takeWorker();
  const files = {};
  for (const [p, f] of Object.entries(ws.files)) files[p] = f.content;
  running = { worker, path, dropped: 0 };
  worker.onmessage = (e) => {
    const m = e.data;
    if (!running || running.worker !== worker) return;
    switch (m.type) {
      case "out":
        running.dropped += m.dropped || 0;
        con.write(m.lines);
        break;
      case "input":
        setStatus("Waiting for input…", "");
        con.input(m.prompt).then((value) => {
          if (running?.worker === worker) {
            setStatus(`Running ${baseName(path)}…`, "");
            worker.postMessage({ type: "input", value });
          }
        });
        break;
      case "file":
        ws.write(m.path, m.content);
        editor.setContent(m.path, m.content);
        break;
      case "done":
        finishRun();
        worker.terminate();
        if (m.ok) {
          setStatus(`Finished in ${formatMs(m.ms)}`, "ok");
        } else {
          const where = m.phase === "compile" ? "Syntax error" : "Error";
          setStatus(where, "err");
          con.error(m.error.message, m.error.line, (line) => goToLine(path, line));
          if (ws.data.active === path && m.error.line) editor.showError(m.error);
        }
        break;
    }
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    finishRun();
    setStatus("Error", "err");
    con.error("The program could not start: " + (e.message || "worker error"), null);
  };
  worker.postMessage({ type: "run", code: ws.read(path), mode, files, dir: dirName(path) });
}

function formatMs(ms) {
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function finishRun() {
  if (running?.dropped) {
    con.system(`(Output was too fast to show in full: only the most recent lines are kept, ${running.dropped.toLocaleString()} earlier lines were skipped.)`);
  }
  running = null;
  con.cancelInput();
  setRunning(false);
  setTimeout(warm, 50);
}

function stopProgram() {
  if (!running) return;
  running.worker.terminate();
  finishRun();
  con.system("Stopped.");
  setStatus("Stopped", "");
}

function goToLine(path, line) {
  if (ws.data.active !== path) openFile(path);
  editor.goTo(line);
}

$("run").addEventListener("click", runProgram);
$("stop").addEventListener("click", stopProgram);
$("clear").addEventListener("click", () => { if (!running) { con.clear(); setStatus("", ""); } });
$("console").addEventListener("click", () => { if (!window.getSelection()?.toString()) con.focusInput(); });

// ---------- reference panel ----------
function toggleRef(show = $("refpanel").hidden) {
  $("refpanel").hidden = !show;
  $("toggle-ref").setAttribute("aria-pressed", String(show));
  store.set("pc.ref", show ? "1" : "0");
  if (show) { renderRef(); }
}
$("toggle-ref").addEventListener("click", () => toggleRef());
$("close-ref").addEventListener("click", () => toggleRef(false));
$("ref-search").addEventListener("input", renderRef);

// ---------- theme ----------
$("theme").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("pc.theme", next);
});

// ---------- console resize ----------
(() => {
  const center = document.querySelector(".center");
  const rz = $("resizer");
  const saved = Number(store.get("pc.consoleH"));
  if (saved > 40) center.style.setProperty("--console-h", `${Math.min(saved, Math.round(innerHeight * 0.6))}px`);
  let startY = 0, startH = 0;
  const move = (e) => {
    const total = center.getBoundingClientRect().height;
    const h = Math.min(total - 100, Math.max(60, startH + (startY - e.clientY)));
    center.style.setProperty("--console-h", `${h}px`);
  };
  const up = () => {
    rz.classList.remove("dragging");
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    store.set("pc.consoleH", String(Math.round(document.querySelector(".console-wrap").getBoundingClientRect().height)));
  };
  rz.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = document.querySelector(".console-wrap").getBoundingClientRect().height;
    rz.classList.add("dragging");
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
  rz.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const h = document.querySelector(".console-wrap").getBoundingClientRect().height + (e.key === "ArrowUp" ? 20 : -20);
    center.style.setProperty("--console-h", `${Math.max(60, h)}px`);
  });
})();

// ---------- global keys ----------
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runProgram(); }
  else if (e.key === "F1") { e.preventDefault(); toggleRef(); }
  else if (e.key === "Escape" && !menu.hidden) hideMenu();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); ws.save(true); }
});
$("toggle-files").addEventListener("click", () => $("sidebar").classList.toggle("open"));
document.addEventListener("pointerdown", (e) => {
  const sb = $("sidebar");
  if (sb.classList.contains("open") && !sb.contains(e.target) && !$("toggle-files").contains(e.target) && !$("dialog").contains(e.target) && !menu.contains(e.target)) {
    sb.classList.remove("open");
  }
});
addEventListener("beforeunload", () => ws.save(true));
addEventListener("pagehide", () => ws.save(true));

// ---------- start ----------
ensureOpenFile();
if (store.get("pc.ref") === "1" && innerWidth > 760) toggleRef(true);
warm();
