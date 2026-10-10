// Virtual file system persisted in localStorage.
// Paths use "/" separators with no leading slash, e.g. "examples/scores.txt".

const KEY = "pc.workspace.v1";
export const DEFAULT_NAME = "My workspace";

export function validateWorkspaceName(name) {
  if (!name || !name.trim()) return "Name cannot be empty";
  if (name.length > 60) return "Name is too long (60 characters max)";
  return null;
}
const CODE_EXT = /\.(pseudo|pse|psc|pc)$/i;

export const isCodeFile = (path) => CODE_EXT.test(path);
export const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
export const dirName = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);

export function validateName(name) {
  if (!name || !name.trim()) return "Name cannot be empty";
  if (/[\\/:*?"<>|]/.test(name)) return 'Name cannot contain \\ / : * ? " < > |';
  if (name === "." || name === "..") return "Invalid name";
  if (name.length > 120) return "Name is too long";
  return null;
}

export class Workspace {
  constructor(seed) {
    this.listeners = new Set();
    this.saveTimer = null;
    this.onSaveError = null;
    let data = null;
    try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { data = null; }
    if (!data || typeof data.files !== "object") {
      data = { files: {}, folders: [], open: [], active: null, expanded: {}, mode: "igcse" };
      seed(this, data);
    }
    this.data = data;
    if (typeof this.data.name !== "string" || !this.data.name.trim()) this.data.name = DEFAULT_NAME;
    this.data.folders ||= [];
    this.data.expanded ||= {};
    this.data.open = (this.data.open || []).filter((p) => this.data.files[p]);
    if (this.data.active && !this.data.files[this.data.active]) this.data.active = null;
  }

  on(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  save(now = false) {
    clearTimeout(this.saveTimer);
    const write = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        this.onSaveError?.(e);
      }
    };
    if (now) write();
    else this.saveTimer = setTimeout(write, 300);
  }

  get files() { return this.data.files; }
  exists(path) { return !!this.data.files[path]; }
  isFolder(path) { return this.data.folders.includes(path); }
  read(path) { return this.data.files[path]?.content ?? null; }
  modeOf(path) { return this.data.files[path]?.mode || this.data.mode || "igcse"; }

  setMode(path, mode) {
    this.data.mode = mode;
    if (path && this.data.files[path]) this.data.files[path].mode = mode;
    this.save();
  }

  write(path, content, { silent = false } = {}) {
    const f = this.data.files[path];
    if (f) f.content = content;
    else {
      this.ensureFolder(dirName(path));
      this.data.files[path] = { content, mode: isCodeFile(path) ? this.data.mode : undefined };
    }
    this.save();
    if (!silent || !f) this.emit();
  }

  ensureFolder(dir) {
    if (!dir) return;
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      if (!this.data.folders.includes(p)) this.data.folders.push(p);
    }
  }

  createFile(path, content = "") {
    if (this.exists(path) || this.isFolder(path)) throw new Error(`"${path}" already exists`);
    this.write(path, content);
  }

  createFolder(path) {
    if (this.exists(path) || this.isFolder(path)) throw new Error(`"${path}" already exists`);
    this.ensureFolder(path);
    this.data.expanded[path] = true;
    this.save();
    this.emit();
  }

  // Rename/move a file or folder. Returns a map of oldPath -> newPath for moved files.
  move(from, to) {
    if (from === to) return new Map();
    if (this.exists(to) || this.isFolder(to)) throw new Error(`"${to}" already exists`);
    const moved = new Map();
    if (this.isFolder(from)) {
      if (to === from || to.startsWith(from + "/")) throw new Error("Cannot move a folder into itself");
      this.data.folders = this.data.folders.map((f) => (f === from || f.startsWith(from + "/") ? to + f.slice(from.length) : f));
      for (const p of Object.keys(this.data.files)) {
        if (p.startsWith(from + "/")) moved.set(p, to + p.slice(from.length));
      }
      if (this.data.expanded[from]) this.data.expanded[to] = true;
    } else {
      moved.set(from, to);
    }
    this.ensureFolder(dirName(to));
    for (const [a, b] of moved) {
      this.data.files[b] = this.data.files[a];
      delete this.data.files[a];
    }
    this.data.open = this.data.open.map((p) => moved.get(p) || p);
    if (moved.has(this.data.active)) this.data.active = moved.get(this.data.active);
    this.save();
    this.emit();
    return moved;
  }

  // Delete a file or folder. Returns deleted file paths.
  remove(path) {
    const removed = [];
    if (this.isFolder(path)) {
      this.data.folders = this.data.folders.filter((f) => f !== path && !f.startsWith(path + "/"));
      for (const p of Object.keys(this.data.files)) if (p.startsWith(path + "/")) removed.push(p);
    } else if (this.exists(path)) removed.push(path);
    for (const p of removed) delete this.data.files[p];
    this.data.open = this.data.open.filter((p) => !removed.includes(p));
    if (removed.includes(this.data.active)) this.data.active = this.data.open[this.data.open.length - 1] || null;
    this.save();
    this.emit();
    return removed;
  }

  // Tree: [{ type: 'folder'|'file', path, name, children? }]
  tree() {
    const root = { children: new Map() };
    const folderNode = (path) => {
      let node = root;
      if (!path) return node;
      let cur = "";
      for (const part of path.split("/")) {
        cur = cur ? `${cur}/${part}` : part;
        if (!node.children.has(part)) node.children.set(part, { type: "folder", path: cur, name: part, children: new Map() });
        node = node.children.get(part);
      }
      return node;
    };
    for (const f of this.data.folders) folderNode(f);
    for (const p of Object.keys(this.data.files)) {
      folderNode(dirName(p)).children.set(baseName(p), { type: "file", path: p, name: baseName(p) });
    }
    const sort = (node) => {
      const arr = [...node.children.values()].sort((a, b) =>
        a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })
      );
      for (const n of arr) if (n.type === "folder") n.children = sort(n);
      return arr;
    };
    return sort(root);
  }

  uniquePath(dir, name) {
    let p = joinPath(dir, name);
    if (!this.exists(p) && !this.isFolder(p)) return p;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
    for (let i = 2; ; i++) {
      p = joinPath(dir, `${stem} (${i})${ext}`);
      if (!this.exists(p) && !this.isFolder(p)) return p;
    }
  }

  get name() { return this.data.name; }
  rename(name) {
    this.data.name = name.trim();
    this.save();
  }

  exportJSON() {
    return JSON.stringify({ format: "pseudocode-workspace", version: 1, name: this.data.name, files: this.data.files, folders: this.data.folders }, null, 1);
  }

  // replace: true wipes the current workspace first and takes the saved name
  // (or fallbackName for older saves); otherwise files are added alongside.
  importJSON(text, { replace = false, fallbackName = DEFAULT_NAME } = {}) {
    let d;
    try { d = JSON.parse(text); } catch { throw new Error("This is not a saved workspace file"); }
    if (!d || typeof d.files !== "object" || Array.isArray(d.files)) throw new Error("This is not a saved workspace file");
    if (replace) {
      this.data.files = {};
      this.data.folders = [];
      this.data.open = [];
      this.data.active = null;
      this.data.expanded = {};
      const saved = typeof d.name === "string" ? d.name.trim().slice(0, 60) : "";
      this.data.name = saved || fallbackName.slice(0, 60) || DEFAULT_NAME;
    }
    let count = 0;
    for (const [p, f] of Object.entries(d.files)) {
      if (typeof f?.content !== "string") continue;
      const path = this.exists(p) ? this.uniquePath(dirName(p), baseName(p)) : p;
      this.ensureFolder(dirName(path));
      this.data.files[path] = { content: f.content, mode: f.mode };
      count++;
    }
    for (const f of d.folders || []) this.ensureFolder(f);
    this.save();
    this.emit();
    return count;
  }
}
