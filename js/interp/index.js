import { compile } from "./compiler.js";
import { createRuntime } from "./runtime.js";
import { PseudoError } from "./errors.js";

export { compile, PseudoError };

// Checks a program without running it. Returns null or { message, line, col, endCol }.
export function check(src, mode) {
  try {
    compile(src, mode);
    return null;
  } catch (e) {
    return toError(e, null);
  }
}

// Runs a program. io: see createRuntime. Returns { ok, error? }.
export async function run(src, mode, io) {
  let js;
  try {
    js = compile(src, mode);
  } catch (e) {
    return { ok: false, error: toError(e, null), phase: "compile" };
  }
  let main;
  try {
    main = new Function(js)();
  } catch (e) {
    return { ok: false, error: { message: "Internal compiler error: " + e.message, line: null }, phase: "compile" };
  }
  const R = createRuntime(io);
  try {
    await main(R);
    R.closeAll();
    return { ok: true };
  } catch (e) {
    try { R.closeAll(); } catch { /* ignore */ }
    return { ok: false, error: toError(e, R.L), phase: "run" };
  }
}

function toError(e, line) {
  if (e instanceof PseudoError) {
    return { message: e.message, line: e.line ?? line, col: e.col, endCol: e.endCol };
  }
  if (e instanceof RangeError && /call stack/i.test(e.message)) {
    return { message: "Too much recursion: a procedure or function keeps calling itself without stopping", line };
  }
  return { message: "Internal error: " + (e && e.message ? e.message : String(e)), line };
}
