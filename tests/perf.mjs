// Quick sanity checks for recursion depth and loop speed.
import { run } from "../js/interp/index.js";

const io = () => ({ output: () => {}, input: async () => "", files: {}, dir: "", fileChanged: () => {} });

let t = performance.now();
let r = await run(`
FUNCTION Sum(N : INTEGER) RETURNS INTEGER
  IF N = 0 THEN
    RETURN 0
  ENDIF
  RETURN N + Sum(N - 1)
ENDFUNCTION
OUTPUT Sum(1990)
`, "as", io());
console.log("deep recursion:", r.ok ? "ok" : r.error.message, Math.round(performance.now() - t), "ms");

t = performance.now();
r = await run(`
DECLARE A : ARRAY[1:3000] OF INTEGER
DECLARE I, J, T : INTEGER
FOR I <- 1 TO 3000
  A[I] <- 3001 - I
NEXT I
FOR I <- 1 TO 2999
  FOR J <- 1 TO 3000 - I
    IF A[J] > A[J + 1] THEN
      T <- A[J]
      A[J] <- A[J + 1]
      A[J + 1] <- T
    ENDIF
  NEXT J
NEXT I
OUTPUT A[1]
`, "igcse", io());
console.log("bubble sort 3000 (4.5M compares):", r.ok ? "ok" : r.error.message, Math.round(performance.now() - t), "ms");

t = performance.now();
r = await run(`
FUNCTION Fib(N : INTEGER) RETURNS INTEGER
  IF N < 2 THEN
    RETURN N
  ENDIF
  RETURN Fib(N - 1) + Fib(N - 2)
ENDFUNCTION
OUTPUT Fib(25)
`, "igcse", io());
console.log("fib(25) (250k calls):", r.ok ? "ok" : r.error.message, Math.round(performance.now() - t), "ms");
