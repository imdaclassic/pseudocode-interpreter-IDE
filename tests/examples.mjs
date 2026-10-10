// Runs every bundled example program to make sure none of them error.
import { run } from "../js/interp/index.js";
import { EXAMPLES } from "../js/examples.js";

const files = {};
for (const e of EXAMPLES) files[e.path] = e.content;

let fail = 0;
for (const e of EXAMPLES) {
  if (!/\.pseudo$/.test(e.path)) continue;
  const out = [];
  const dir = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
  const res = await run(e.content, e.mode, {
    output: (t) => out.push(t),
    input: async () => "2",
    files,
    dir,
    fileChanged: () => {},
  });
  if (!res.ok) {
    fail++;
    console.log(`FAIL ${e.path}: line ${res.error.line}: ${res.error.message}`);
  } else {
    console.log(`ok   ${e.path}\n     ${out.slice(0, 4).join("\n     ")}`);
  }
}
console.log(fail ? `${fail} failed` : "all examples ran");
process.exit(fail ? 1 : 0);
