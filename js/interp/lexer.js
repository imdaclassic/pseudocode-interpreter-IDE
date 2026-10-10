import { PseudoError } from "./errors.js";

// Words that can never be used as identifiers.
export const HARD_KEYWORDS = new Set([
  "DECLARE", "CONSTANT", "INPUT", "OUTPUT", "IF", "THEN", "ELSE", "ELSEIF", "ENDIF",
  "CASE", "OF", "OTHERWISE", "ENDCASE", "FOR", "TO", "STEP", "NEXT", "ENDFOR",
  "WHILE", "DO", "ENDWHILE", "REPEAT", "UNTIL", "PROCEDURE", "ENDPROCEDURE",
  "FUNCTION", "ENDFUNCTION", "RETURNS", "RETURN", "CALL", "AND", "OR", "NOT",
  "DIV", "MOD", "TRUE", "FALSE", "ARRAY", "OPENFILE", "READFILE", "WRITEFILE",
  "CLOSEFILE", "INTEGER", "REAL", "CHAR", "STRING", "BOOLEAN", "ENDTYPE",
  "ENDCLASS", "SUPER", "BYREF", "BYVAL", "PUBLIC", "PRIVATE", "INHERITS",
  "SEEK", "GETRECORD", "PUTRECORD",
]);

const OPS = [
  ["<-", "<-"], ["←", "<-"], ["<>", "<>"], ["≠", "<>"], ["<=", "<="], ["≤", "<="],
  [">=", ">="], ["≥", ">="], ["=", "="], ["<", "<"], [">", ">"], ["+", "+"],
  ["-", "-"], ["−", "-"], ["*", "*"], ["×", "*"], ["/", "/"], ["÷", "/"], ["^", "^"], ["↑", "^"],
  ["&", "&"], ["(", "("], [")", ")"], ["[", "["], ["]", "]"], [",", ","], [":", ":"], [".", "."],
];

// Token: { t: 'num'|'str'|'char'|'word'|'op'|'nl'|'eof', v, raw, line, col, end, sp }
// line is 1-based, col/end are 0-based columns. sp = whitespace precedes the token.
export function lex(src) {
  const toks = [];
  let i = 0, line = 1, lineStart = 0, sp = true;
  const n = src.length;
  const push = (t, v, start, raw) =>
    toks.push({ t, v, raw: raw ?? src.slice(start, i), line, col: start - lineStart, end: i - lineStart, sp });

  while (i < n) {
    const c = src[i];
    if (c === "\n") {
      const start = i;
      i++;
      push("nl", "\n", start);
      line++; lineStart = i; sp = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === " ") { i++; sp = true; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      sp = true;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(c)) {
      while (i < n && /[0-9]/.test(src[i])) i++;
      let real = false;
      if (src[i] === "." && /[0-9]/.test(src[i + 1] || "")) {
        real = true;
        i++;
        while (i < n && /[0-9]/.test(src[i])) i++;
      }
      if (/[A-Za-z_]/.test(src[i] || "")) {
        throw new PseudoError(`Invalid number '${src.slice(start, i + 1)}'`, line, start - lineStart, i + 1 - lineStart);
      }
      push("num", Number(src.slice(start, i)), start);
      toks[toks.length - 1].real = real;
      sp = false;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
      const raw = src.slice(start, i);
      push("word", raw.toUpperCase(), start, raw);
      sp = false;
      continue;
    }
    if (c === '"' || c === "“" || c === "”") {
      i++;
      let s = "";
      while (i < n && src[i] !== '"' && src[i] !== "”" && src[i] !== "“" && src[i] !== "\n") s += src[i++];
      if (i >= n || src[i] === "\n") throw new PseudoError("Unterminated string: missing closing \"", line, start - lineStart, i - lineStart);
      i++;
      push("str", s, start);
      sp = false;
      continue;
    }
    if (c === "'" || c === "‘" || c === "’") {
      i++;
      let s = "";
      while (i < n && src[i] !== "'" && src[i] !== "’" && src[i] !== "‘" && src[i] !== "\n") s += src[i++];
      if (i >= n || src[i] === "\n") throw new PseudoError("Unterminated character: missing closing '", line, start - lineStart, i - lineStart);
      i++;
      push(s.length === 1 ? "char" : "str", s, start);
      sp = false;
      continue;
    }
    let matched = false;
    for (const [sym, op] of OPS) {
      if (src.startsWith(sym, i)) {
        i += sym.length;
        push("op", op, start);
        matched = true;
        break;
      }
    }
    if (!matched) throw new PseudoError(`Unexpected character '${c}'`, line, start - lineStart, start + 1 - lineStart);
    sp = false;
  }
  toks.push({ t: "nl", v: "\n", raw: "", line, col: i - lineStart, end: i - lineStart, sp: true });
  toks.push({ t: "eof", v: null, raw: "", line, col: i - lineStart, end: i - lineStart, sp: true });
  return toks;
}
