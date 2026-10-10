// Runs a program off the main thread so infinite loops can't freeze the page.
import { run } from "./interp/index.js";

// Output is sent at most every FLUSH_MS; between sends only the last KEEP lines
// are kept, so a runaway OUTPUT loop can't flood the page.
const FLUSH_MS = 40;
const KEEP = 1000;

let resolveInput = null;
let buf = [];
let dropped = 0;
let lastFlush = 0;
let waited = 0;

function flush() {
  if (buf.length || dropped) {
    postMessage({ type: "out", lines: buf, dropped });
    buf = [];
    dropped = 0;
  }
  lastFlush = performance.now();
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === "input") {
    const r = resolveInput;
    resolveInput = null;
    r?.(m.value);
    return;
  }
  if (m.type !== "run") return;
  const t0 = performance.now();
  lastFlush = t0;
  const res = await run(m.code, m.mode, {
    output(text) {
      buf.push(text);
      if (buf.length > KEEP * 2) {
        dropped += buf.length - KEEP;
        buf = buf.slice(-KEEP);
      }
      if (performance.now() - lastFlush > FLUSH_MS) flush();
    },
    input(prompt) {
      flush();
      postMessage({ type: "input", prompt });
      const start = performance.now();
      return new Promise((r) => {
        resolveInput = (v) => { waited += performance.now() - start; r(v); };
      });
    },
    files: m.files,
    dir: m.dir,
    fileChanged(path, content) {
      flush();
      postMessage({ type: "file", path, content });
    },
  });
  flush();
  postMessage({ type: "done", ok: res.ok, error: res.error, phase: res.phase, ms: performance.now() - t0 - waited });
};
