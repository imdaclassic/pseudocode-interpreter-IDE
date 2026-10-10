// Output console with inline INPUT support.
// Program output is buffered and drawn at most once per animation frame,
// keeping only the last MAX_LINES lines, so heavy output can't lock up the page.
const MAX_LINES = 3000;

export class Console {
  constructor(el) {
    this.el = el;
    this.count = 0;
    this.pending = [];
    this.frame = 0;
    this.pendingInput = null;
  }

  clear() {
    this.cancelInput();
    this.pending = [];
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.el.textContent = "";
    this.count = 0;
  }

  atBottom() {
    return this.el.scrollHeight - this.el.scrollTop - this.el.clientHeight < 40;
  }

  // lines: array of strings, each a separate OUTPUT
  write(lines) {
    for (const l of lines) this.pending.push(l);
    if (this.pending.length > MAX_LINES) this.pending = this.pending.slice(-MAX_LINES);
    if (!this.frame) this.frame = requestAnimationFrame(() => this.render());
  }

  render() {
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    if (!this.pending.length) return;
    const lines = this.pending;
    this.pending = [];
    const stick = this.count === 0 || this.atBottom();
    if (lines.length >= MAX_LINES) {
      this.el.textContent = "";
      this.count = 0;
    }
    const frag = document.createDocumentFragment();
    for (const text of lines) {
      const d = document.createElement("div");
      d.className = "line";
      d.textContent = text;
      frag.appendChild(d);
    }
    this.el.appendChild(frag);
    this.count += lines.length;
    this.trim();
    if (stick) this.el.scrollTop = this.el.scrollHeight;
  }

  trim() {
    const excess = this.count - MAX_LINES;
    if (excess <= 0) return;
    const range = document.createRange();
    range.setStartBefore(this.el.firstChild);
    range.setEndAfter(this.el.children[excess - 1]);
    range.deleteContents();
    this.count -= excess;
  }

  addNode(node) {
    this.render(); // keep ordering with buffered output
    const stick = this.atBottom();
    this.el.appendChild(node);
    this.count++;
    this.trim();
    if (stick) this.el.scrollTop = this.el.scrollHeight;
  }

  system(text) {
    const d = document.createElement("div");
    d.className = "line sys";
    d.textContent = text;
    this.addNode(d);
  }

  error(message, line, onLineClick) {
    const d = document.createElement("div");
    d.className = "err";
    if (line) {
      const a = document.createElement("a");
      a.textContent = `Line ${line}`;
      a.addEventListener("click", () => onLineClick(line));
      d.append(a, ": " + message);
    } else d.textContent = message;
    this.addNode(d);
  }

  // Shows an input box; resolves with the entered text.
  input(prompt) {
    this.cancelInput();
    return new Promise((resolve) => {
      const row = document.createElement("div");
      row.className = "line input-row";
      const p = document.createElement("span");
      p.textContent = prompt;
      const inp = document.createElement("input");
      inp.setAttribute("aria-label", prompt || "Program input");
      inp.spellcheck = false;
      inp.autocomplete = "off";
      row.append(p, inp);
      this.addNode(row);
      this.el.scrollTop = this.el.scrollHeight;
      inp.focus({ preventScroll: true });
      const done = (value) => {
        const span = document.createElement("span");
        span.className = "in";
        span.textContent = value;
        inp.replaceWith(span);
        this.pendingInput = null;
        resolve(value);
      };
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); done(inp.value); }
      });
      this.pendingInput = { row, inp };
    });
  }

  cancelInput() {
    if (this.pendingInput) {
      this.pendingInput.inp.disabled = true;
      this.pendingInput = null;
    }
  }

  focusInput() {
    this.pendingInput?.inp.focus();
  }
}
