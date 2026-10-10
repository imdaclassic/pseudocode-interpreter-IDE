// Runs every case in cases.mjs through the interpreter and compares output.
import { run } from "../js/interp/index.js";
import { cases } from "./cases.mjs";

let pass = 0, fail = 0;
const only = process.argv[2];

for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  const out = [];
  const inputs = [...(c.input || [])];
  const files = { ...(c.files || {}) };
  const io = {
    output: (t) => out.push(t),
    input: async () => {
      if (!inputs.length) throw new Error("test ran out of input");
      return inputs.shift();
    },
    files,
    dir: "",
    fileChanged: () => {},
  };
  const res = await run(c.src, c.mode || "as", io);
  const text = out.join("\n");
  let ok;
  let got;
  if (c.error) {
    got = res.ok ? `(no error) output:\n${text}` : `line ${res.error.line}: ${res.error.message}`;
    ok = !res.ok && c.error.test(res.error.message) && (c.errLine === undefined || c.errLine === res.error.line);
  } else {
    got = res.ok ? text : `${text}\nERROR line ${res.error.line}: ${res.error.message}`;
    ok = res.ok && text === c.out.trim();
    if (ok && c.files_after) {
      for (const [k, v] of Object.entries(c.files_after)) if (files[k] !== v) { ok = false; got += `\nfile ${k} = ${JSON.stringify(files[k])}`; }
    }
  }
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${c.name}\n  expected: ${c.error ? c.error : JSON.stringify(c.out.trim())}\n  got:      ${JSON.stringify(got)}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
