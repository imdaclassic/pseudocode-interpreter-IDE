import { PseudoError } from "./errors.js";

// ---------- value classes ----------
export class PArray {
  constructor(t, dims, data) { this.t = t; this.dims = dims; this.data = data; }
}
export class PRecord {
  constructor(t, f) { this.t = t; this.f = f; }
}
export class PEnum {
  constructor(t, i, name) { this.t = t; this.i = i; this.name = name; }
}
export class PPointer {
  constructor(cell) { this.c = cell; }
}
export class PSet {
  constructor(t, items) { this.t = t; this.items = items; }
}
export class PObject {
  constructor(cls) { this.cls = cls; this.f = Object.create(null); }
}
export class PDate {
  constructor(d, m, y) { this.d = d; this.m = m; this.y = y; }
  ord() { return Date.UTC(this.y, this.m - 1, this.d); }
  toString() { return `${String(this.d).padStart(2, "0")}/${String(this.m).padStart(2, "0")}/${this.y}`; }
}

const BASIC = new Set(["INTEGER", "REAL", "STRING", "CHAR", "BOOLEAN", "DATE"]);

export function typeName(t) {
  if (!t) return "any";
  if (typeof t === "string") return t;
  if (t.k === "array") {
    const dims = t.dims ? `[${t.dims.map(([l, h]) => `${l}:${h}`).join(", ")}]` : "";
    return `ARRAY${dims} OF ${typeName(t.el)}`;
  }
  return t.name;
}

export function formatNum(n) {
  if (Number.isInteger(n)) return String(n);
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : n < 0 ? "-Infinity" : "NaN";
  return String(parseFloat(n.toPrecision(12)));
}

export function valueTypeName(v) {
  if (typeof v === "number") return Number.isInteger(v) ? "INTEGER" : "REAL";
  if (typeof v === "string") return v.length === 1 ? "CHAR" : "STRING";
  if (typeof v === "boolean") return "BOOLEAN";
  if (v instanceof PDate) return "DATE";
  if (v instanceof PArray) return "ARRAY";
  if (v instanceof PRecord || v instanceof PEnum || v instanceof PSet) return v.t.name;
  if (v instanceof PObject) return v.cls.name;
  if (v instanceof PPointer) return "pointer";
  return "unknown";
}

export function format(v) {
  if (typeof v === "number") return formatNum(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof PDate) return v.toString();
  if (v instanceof PEnum) return v.name;
  if (v instanceof PArray) return "[" + v.data.map((c) => (c.v === undefined ? "?" : format(c.v))).join(", ") + "]";
  if (v instanceof PRecord) return "{" + v.t.fields.map(([n, raw]) => `${raw}: ${v.f[n].v === undefined ? "?" : format(v.f[n].v)}`).join(", ") + "}";
  if (v instanceof PSet) return "{" + v.items.map(format).join(", ") + "}";
  if (v instanceof PObject) return `<${v.cls.name} object>`;
  if (v instanceof PPointer) return v.c ? `<pointer to ${v.c.n ?? "value"}>` : "<null pointer>";
  if (v === null) return "NULL";
  return String(v);
}

function parseDate(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s);
  if (!m) return null;
  return makeDate(+m[1], +m[2], +m[3]);
}
function makeDate(d, m, y) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return new PDate(d, m, y);
}

// ---------- runtime ----------
// io: { output(text), input(prompt) -> Promise<string>, files: {path: content}, dir, fileChanged(path, content) }
export function createRuntime(io) {
  const E = (msg) => new PseudoError(msg);
  const openFiles = new Map();

  const R = {
    L: 1,
    depth: 0,
    maxDepth: 2000,
    tooDeep(name) {
      throw E(`Too much recursion: ${name} called itself more than ${R.maxDepth} times without stopping`);
    },

    // ---- cells & declarations ----
    cell(n, t) { return { n, t, v: undefined }; },
    tmp(v) { return { n: null, t: null, v, tmp: true }; },
    decl(n, t) { return { n, t, v: initial(t) }; },
    constant(n, v) { return { n, t: null, v, isConst: true }; },

    g(c) {
      const v = c.v;
      if (v === undefined) throw E(`'${c.n}' has not been given a value yet`);
      return v;
    },
    set(c, v) {
      if (c.isConst) throw E(`Cannot change constant '${c.n}'`);
      c.v = coerce(v, c.t, c.n);
    },

    // ---- types ----
    arrT(dims, el) {
      if (dims) {
        for (const [lo, hi] of dims) {
          if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw E("Array bounds must be whole numbers");
          if (lo > hi) throw E(`Array lower bound ${lo} is greater than upper bound ${hi}`);
        }
        const size = dims.reduce((a, [lo, hi]) => a * (hi - lo + 1), 1);
        if (size > 10_000_000) throw E(`Array is too large (${size} elements)`);
      }
      return { k: "array", dims, el };
    },
    recordType(name, thunk) {
      let fields = null;
      return { k: "record", name, get fields() { return fields || (fields = thunk()); } };
    },
    enumType(name, names) {
      const t = { k: "enum", name, vals: [] };
      t.vals = names.map((n, i) => new PEnum(t, i, n));
      return t;
    },
    ptrType(name, thunk) {
      let to;
      return { k: "ptr", name, get to() { return to === undefined ? (to = thunk()) : to; } };
    },
    setType(name, thunk) {
      let el;
      return { k: "set", name, get el() { return el === undefined ? (el = thunk()) : el; } };
    },
    classType(name, parentThunk, fieldsThunk) {
      let parent;
      return {
        k: "class", name, methods: new Map(), fieldsThunk,
        get parent() { return parent === undefined ? (parent = parentThunk()) : parent; },
      };
    },
    addMethod(cls, name, meta, fn) { cls.methods.set(name, { ...meta, fn, cls }); },

    // ---- arrays ----
    el1(a, i, name) {
      if (!(a instanceof PArray)) throw E(`'${name}' is not an array`);
      const d = a.dims;
      if (d.length !== 1) throw E(`'${name}' is a ${d.length}D array; it needs ${d.length} indexes`);
      if (!Number.isInteger(i)) throw E(`Array index must be a whole number, not ${format(i)}`);
      const lo = d[0][0];
      if (i < lo || i > d[0][1]) throw E(`Index ${i} is out of range for ${name}[${lo}:${d[0][1]}]`);
      return a.data[i - lo];
    },
    el2(a, i, j, name) {
      if (!(a instanceof PArray)) throw E(`'${name}' is not an array`);
      const d = a.dims;
      if (d.length !== 2) throw E(`'${name}' is a ${d.length}D array; it needs ${d.length} index${d.length === 1 ? "" : "es"}`);
      if (!Number.isInteger(i) || !Number.isInteger(j)) throw E(`Array indexes must be whole numbers`);
      if (i < d[0][0] || i > d[0][1]) throw E(`Row index ${i} is out of range for ${name}[${d[0][0]}:${d[0][1]}, ...]`);
      if (j < d[1][0] || j > d[1][1]) throw E(`Column index ${j} is out of range for ${name}[..., ${d[1][0]}:${d[1][1]}]`);
      return a.data[(i - d[0][0]) * (d[1][1] - d[1][0] + 1) + (j - d[1][0])];
    },
    el(a, idx, name) {
      if (!(a instanceof PArray)) throw E(`'${name}' is not an array`);
      const d = a.dims;
      if (d.length !== idx.length) throw E(`'${name}' needs ${d.length} indexes but ${idx.length} given`);
      let off = 0;
      for (let k = 0; k < d.length; k++) {
        const i = idx[k];
        if (!Number.isInteger(i)) throw E(`Array indexes must be whole numbers`);
        if (i < d[k][0] || i > d[k][1]) throw E(`Index ${i} is out of range ${d[k][0]}:${d[k][1]} for ${name}`);
        off = off * (d[k][1] - d[k][0] + 1) + (i - d[k][0]);
      }
      return a.data[off];
    },
    ge1(a, i, name) {
      const c = R.el1(a, i, name);
      if (c.v === undefined) throw E(`${name}[${i}] has not been given a value yet`);
      return c.v;
    },
    ge2(a, i, j, name) {
      const c = R.el2(a, i, j, name);
      if (c.v === undefined) throw E(`${name}[${i}, ${j}] has not been given a value yet`);
      return c.v;
    },

    // ---- records / objects ----
    fieldRef(base, name, raw, ctx) {
      if (base instanceof PRecord) {
        const c = base.f[name];
        if (!c) throw E(`Record type ${base.t.name} has no field '${raw}'`);
        return c;
      }
      if (base instanceof PObject) {
        const info = base.cls.fieldInfo.get(name);
        if (!info) {
          if (findMethod(base.cls, name)) throw E(`'${raw}' is a method of ${base.cls.name}; call it with ${raw}()`);
          throw E(`Class ${base.cls.name} has no attribute '${raw}'`);
        }
        if (info.priv && ctx !== info.cls) throw E(`'${raw}' is PRIVATE in class ${info.cls.name}`);
        return base.f[name];
      }
      if (base instanceof PPointer) throw E(`Use ^ to follow the pointer first, e.g. p^.${raw}`);
      throw E(`Cannot use '.${raw}' on a ${valueTypeName(base)} value`);
    },
    member(base, name, raw, ctx) {
      const c = R.fieldRef(base, name, raw, ctx);
      if (c.v === undefined) throw E(`Field '${raw}' has not been given a value yet`);
      return c.v;
    },
    async newObj(cls, args, ctx) {
      const o = new PObject(cls);
      prepareClass(cls);
      for (const [n, info] of cls.fieldInfo) o.f[n] = { n: info.raw, t: info.t, v: initial(info.t) };
      const ctor = findMethod(cls, "NEW");
      if (ctor) {
        if (ctor.priv && ctx !== ctor.cls) throw E(`The constructor of ${cls.name} is PRIVATE`);
        checkArgs(ctor, args, `${cls.name}.NEW`);
        await ctor.fn(o, ...args);
      } else if (args.length) {
        throw E(`Class ${cls.name} has no constructor (PROCEDURE NEW) but ${args.length} argument${args.length === 1 ? " was" : "s were"} given`);
      }
      return o;
    },
    async callMethod(obj, name, raw, args, ctx, isStmt) {
      if (!(obj instanceof PObject)) {
        throw E(obj === undefined ? `Object has no value. Create it first with NEW` : `Cannot call ${raw}() on a ${valueTypeName(obj)} value`);
      }
      const m = findMethod(obj.cls, name);
      if (!m) throw E(`Class ${obj.cls.name} has no method '${raw}'`);
      if (m.priv && ctx !== m.cls) throw E(`Method '${raw}' is PRIVATE in class ${m.cls.name}`);
      if (isStmt && m.isFunc) throw E(`${raw} is a FUNCTION; use its result in an expression`);
      if (!isStmt && !m.isFunc) throw E(`${raw} is a PROCEDURE and does not return a value`);
      checkArgs(m, args, raw);
      return m.fn(obj, ...args);
    },
    async callSuper(self, cur, name, raw, args) {
      const p = cur.parent;
      const m = p && findMethod(p, name);
      if (!m) throw E(`Parent class ${p ? p.name : "?"} has no method '${raw}'`);
      checkArgs(m, args, `SUPER.${raw}`);
      return m.fn(self, ...args);
    },

    // ---- pointers ----
    addr(c) { return new PPointer(c); },
    deref(p) {
      if (p instanceof PPointer) {
        if (!p.c) throw E("Cannot follow a NULL pointer");
        return p.c;
      }
      if (p === null) throw E("Cannot follow a NULL pointer");
      throw E(`'^' can only follow a pointer, not a ${valueTypeName(p)}`);
    },

    // ---- sets ----
    defineSet(n, t, values) {
      const items = [];
      for (const v of values) {
        const cv = coerce(v, t.el, n);
        if (!items.some((x) => equal(x, cv))) items.push(cv);
      }
      return { n, t, v: new PSet(t, items) };
    },
    inSet(v, s) {
      if (!(s instanceof PSet)) throw E("IN needs a SET on the right");
      return s.items.some((x) => equal(x, v));
    },

    // ---- subroutine plumbing ----
    byval(n, t, c) {
      if (c.v === undefined) throw E(`The argument for parameter '${n}' has no value`);
      const v = coerce(c.v, t, n);
      return { n, t: t && t.k === "array" && !t.dims ? v.t : t, v };
    },
    byref(n, t, c) {
      if (c.tmp) return { n, t, v: c.v === undefined ? undefined : coerce(c.v, t, n) };
      if (t && c.t && typeName(t) !== typeName(c.t) && !(t.k === "array" && !t.dims && c.t.k === "array" && typeName(t.el) === typeName(c.t.el))) {
        if (!(t === "REAL" && c.t === "INTEGER")) throw E(`BYREF parameter '${n}' is ${typeName(t)} but the argument is ${typeName(c.t)}`);
      }
      return c;
    },
    ret(v, t, fname) {
      if (v === undefined) throw E(`${fname} returned no value`);
      return coerce(v, t, `the result of ${fname}`);
    },
    noReturn(fname) { throw E(`FUNCTION ${fname} ended without a RETURN`); },

    // ---- loops ----
    forStart(c, from) {
      R.num(from, "FOR");
      R.set(c, from);
      return from;
    },
    step(s) {
      R.num(s, "STEP");
      if (s === 0) throw E("STEP cannot be 0");
      return s;
    },

    // ---- operators ----
    num(v, what) {
      if (typeof v !== "number") throw E(`${what ? what + " needs" : "Expected"} a number, not ${valueTypeName(v)} ${typeof v === "string" ? `"${v}"` : ""}`.trim());
      return v;
    },
    bool(v, what) {
      if (typeof v !== "boolean") throw E(`${what} needs a BOOLEAN (TRUE/FALSE) value, not ${valueTypeName(v)}`);
      return v;
    },
    add(a, b) {
      if (typeof a === "number" && typeof b === "number") return a + b;
      if (a instanceof PEnum && typeof b === "number") return enumStep(a, b);
      if (typeof a === "string" || typeof b === "string") throw E("'+' cannot join strings. Use & instead");
      return arith(a, b, "+");
    },
    sub(a, b) {
      if (typeof a === "number" && typeof b === "number") return a - b;
      if (a instanceof PEnum && typeof b === "number") return enumStep(a, -b);
      if (a instanceof PDate && b instanceof PDate) return Math.round((a.ord() - b.ord()) / 86400000);
      return arith(a, b, "-");
    },
    mul(a, b) { return typeof a === "number" && typeof b === "number" ? a * b : arith(a, b, "*"); },
    div(a, b) {
      arith(a, b, "/");
      if (b === 0) throw E("Division by zero");
      return a / b;
    },
    idiv(a, b) {
      arith(a, b, "DIV");
      if (b === 0) throw E("Division by zero (DIV)");
      return Math.trunc(a / b);
    },
    mod(a, b) {
      arith(a, b, "MOD");
      if (b === 0) throw E("Division by zero (MOD)");
      return a % b;
    },
    pow(a, b) { arith(a, b, "^"); return Math.pow(a, b); },
    neg(a) { R.num(a, "'-'"); return -a; },
    cat(a, b) {
      return catPart(a) + catPart(b);
    },
    eq(a, b) { cmpCheck(a, b, "="); return equal(a, b); },
    ne(a, b) { cmpCheck(a, b, "<>"); return !equal(a, b); },
    lt(a, b) { return order(a, b, "<") < 0; },
    gt(a, b) { return order(a, b, ">") > 0; },
    le(a, b) { return order(a, b, "<=") <= 0; },
    ge(a, b) { return order(a, b, ">=") >= 0; },
    caseEq(a, b) { return equal(a, b); },
    inRange(v, lo, hi) { return order(v, lo, "TO") >= 0 && order(v, hi, "TO") <= 0; },

    // ---- I/O ----
    output(vals) { io.output(vals.map(format).join("")); },
    async input(c, prompt) {
      const s = await io.input(prompt == null ? "" : format(prompt));
      R.set(c, convertText(s, c.t, c.n, "Input"));
    },

    // ---- files ----
    openFile(name, mode) {
      const path = resolvePath(name);
      if (openFiles.has(path)) throw E(`File "${name}" is already open. CLOSEFILE it first`);
      const f = { name, path, mode, lines: [], pos: 0, recs: null };
      const content = io.files[path];
      if (mode === "READ") {
        if (content === undefined) throw E(`File "${name}" not found. Create it in the Files panel first`);
        f.lines = splitLines(content);
      } else if (mode === "APPEND") {
        f.lines = content === undefined ? [] : splitLines(content);
      } else if (mode === "RANDOM") {
        f.recs = [];
        f.pos = 1;
        if (content !== undefined && content.trim() !== "") {
          try { f.recs = JSON.parse(content); } catch { throw E(`File "${name}" is not a random-access file (it must contain JSON records)`); }
          if (!Array.isArray(f.recs)) throw E(`File "${name}" is not a random-access file`);
        }
      }
      openFiles.set(path, f);
      if (mode === "WRITE") flush(f);
    },
    readFile(name, c) {
      const f = getOpen(name, ["READ"], "READFILE");
      if (f.pos >= f.lines.length) throw E(`No more lines to read in "${name}". Check EOF("${name}") first`);
      R.set(c, convertText(f.lines[f.pos++], c.t, c.n, "READFILE"));
    },
    writeFile(name, v) {
      const f = getOpen(name, ["WRITE", "APPEND"], "WRITEFILE");
      f.lines.push(format(v));
      f.dirty = true;
    },
    closeFile(name) {
      const path = resolvePath(name);
      const f = openFiles.get(path);
      if (!f) throw E(`File "${name}" is not open`);
      flush(f);
      openFiles.delete(path);
    },
    seek(name, addr) {
      const f = getOpen(name, ["RANDOM"], "SEEK");
      if (!Number.isInteger(addr) || addr < 1) throw E(`SEEK address must be a whole number from 1, not ${format(addr)}`);
      f.pos = addr;
    },
    getRecord(name, c) {
      const f = getOpen(name, ["RANDOM"], "GETRECORD");
      const raw = f.recs[f.pos - 1];
      if (raw === undefined || raw === null) throw E(`There is no record at address ${f.pos} in "${name}"`);
      R.set(c, fromJSON(raw, c.t, c.n));
    },
    putRecord(name, v) {
      const f = getOpen(name, ["RANDOM"], "PUTRECORD");
      while (f.recs.length < f.pos - 1) f.recs.push(null);
      f.recs[f.pos - 1] = toJSON(v);
      f.dirty = true;
    },
    closeAll() {
      for (const f of openFiles.values()) flush(f);
      openFiles.clear();
    },

    b: null,
  };

  // ---- builtins ----
  const S = (v, fn, what = "a STRING") => {
    if (typeof v !== "string") throw E(`${fn}() needs ${what}, not ${valueTypeName(v)}`);
    return v;
  };
  const N = (v, fn) => {
    if (typeof v !== "number") throw E(`${fn}() needs a number, not ${valueTypeName(v)}`);
    return v;
  };
  const I = (v, fn) => {
    if (!Number.isInteger(v)) throw E(`${fn}() needs a whole number, not ${format(v)}`);
    return v;
  };
  const D = (v, fn) => {
    if (!(v instanceof PDate)) throw E(`${fn}() needs a DATE, not ${valueTypeName(v)}`);
    return v;
  };
  const substr = (s, start, len, fn) => {
    S(s, fn); I(start, fn); I(len, fn);
    if (start < 1) throw E(`${fn}(): start position must be at least 1`);
    if (len < 0) throw E(`${fn}(): length cannot be negative`);
    if (start + len - 1 > s.length) throw E(`${fn}(): goes past the end of "${s}" (length ${s.length})`);
    return s.substr(start - 1, len);
  };
  const numToStr = (v, fn) => formatNum(N(v, fn));
  const strToNum = (v, fn) => {
    const s = typeof v === "string" ? v.trim() : S(v, fn);
    if (!isNumStr(s)) throw E(`${fn}(): "${v}" is not a valid number`);
    return Number(s);
  };
  const today = () => { const d = new Date(); return new PDate(d.getDate(), d.getMonth() + 1, d.getFullYear()); };

  R.b = {
    LENGTH: (s) => S(s, "LENGTH").length,
    UCASE: (s) => S(s, "UCASE", "a STRING or CHAR").toUpperCase(),
    LCASE: (s) => S(s, "LCASE", "a STRING or CHAR").toLowerCase(),
    TO_UPPER: (s) => S(s, "TO_UPPER", "a STRING or CHAR").toUpperCase(),
    TO_LOWER: (s) => S(s, "TO_LOWER", "a STRING or CHAR").toLowerCase(),
    SUBSTRING: (s, a, n) => substr(s, a, n, "SUBSTRING"),
    MID: (s, a, n) => substr(s, a, n, "MID"),
    LEFT: (s, n) => {
      S(s, "LEFT"); I(n, "LEFT");
      if (n < 0 || n > s.length) throw E(`LEFT(): cannot take ${n} characters from "${s}" (length ${s.length})`);
      return s.slice(0, n);
    },
    RIGHT: (s, n) => {
      S(s, "RIGHT"); I(n, "RIGHT");
      if (n < 0 || n > s.length) throw E(`RIGHT(): cannot take ${n} characters from "${s}" (length ${s.length})`);
      return n === 0 ? "" : s.slice(-n);
    },
    ROUND: (x, p = 0) => {
      N(x, "ROUND"); I(p, "ROUND");
      const f = Math.pow(10, p);
      return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f;
    },
    RANDOM: () => Math.random(),
    RAND: (x) => Math.random() * N(x, "RAND"),
    INT: (x) => Math.trunc(N(x, "INT")),
    DIV: (a, b) => R.idiv(a, b),
    MOD: (a, b) => R.mod(a, b),
    ASC: (c) => {
      S(c, "ASC", "a CHAR");
      if (c.length !== 1) throw E(`ASC() needs a single character, not "${c}"`);
      return c.charCodeAt(0);
    },
    CHR: (n) => {
      I(n, "CHR");
      if (n < 0 || n > 0xffff) throw E(`CHR(): ${n} is not a valid character code`);
      return String.fromCharCode(n);
    },
    NUM_TO_STRING: (v) => numToStr(v, "NUM_TO_STRING"),
    NUM_TO_STR: (v) => numToStr(v, "NUM_TO_STR"),
    STRING_TO_NUM: (v) => strToNum(v, "STRING_TO_NUM"),
    STR_TO_NUM: (v) => strToNum(v, "STR_TO_NUM"),
    IS_NUM: (v) => isNumStr(S(v, "IS_NUM").trim()),
    EOF: (name) => {
      const f = getOpen(name, ["READ"], "EOF");
      return f.pos >= f.lines.length;
    },
    DAY: (d) => D(d, "DAY").d,
    MONTH: (d) => D(d, "MONTH").m,
    YEAR: (d) => D(d, "YEAR").y,
    DAYINDEX: (d) => new Date(D(d, "DAYINDEX").ord()).getUTCDay() + 1,
    SETDATE: (d, m, y) => {
      I(d, "SETDATE"); I(m, "SETDATE"); I(y, "SETDATE");
      const r = makeDate(d, m, y);
      if (!r) throw E(`SETDATE(): ${d}/${m}/${y} is not a valid date`);
      return r;
    },
    NOW: today,
    TODAY: today,
  };

  // ---- helpers bound to this runtime ----
  function resolvePath(name) {
    if (typeof name !== "string") throw E(`File name must be a STRING, not ${valueTypeName(name)}`);
    let p = name.replace(/\\/g, "/").replace(/^\.\//, "");
    if (p.startsWith("/")) return p.slice(1);
    if (io.dir && io.files[p] === undefined && io.files[`${io.dir}/${p}`] !== undefined) return `${io.dir}/${p}`;
    if (io.dir && io.files[p] === undefined) return `${io.dir}/${p}`;
    return p;
  }
  function getOpen(name, modes, op) {
    const f = openFiles.get(resolvePath(name));
    if (!f) throw E(`File "${name}" is not open. Use OPENFILE "${name}" FOR ${modes[0]} first`);
    if (!modes.includes(f.mode)) throw E(`${op} cannot be used on "${name}" because it was opened FOR ${f.mode}`);
    return f;
  }
  function flush(f) {
    let content;
    if (f.mode === "RANDOM") {
      if (!f.dirty) return;
      content = f.recs.length ? "[\n" + f.recs.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n" : "[]\n";
    } else if (f.mode === "WRITE" || f.mode === "APPEND") {
      content = f.lines.length ? f.lines.join("\n") + "\n" : "";
    } else return;
    f.dirty = false;
    io.files[f.path] = content;
    io.fileChanged(f.path, content);
  }

  return R;
}

// ---------- shared helpers ----------
function E(msg) { return new PseudoError(msg); }

function splitLines(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function isNumStr(s) { return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s); }

function initial(t) {
  if (!t || typeof t === "string") return undefined;
  if (t.k === "array") {
    const size = t.dims.reduce((a, [lo, hi]) => a * (hi - lo + 1), 1);
    const data = new Array(size);
    for (let i = 0; i < size; i++) data[i] = { n: null, t: t.el, v: initial(t.el) };
    return new PArray(t, t.dims, data);
  }
  if (t.k === "record") {
    const f = Object.create(null);
    for (const [n, raw, ft] of t.fields) f[n] = { n: raw, t: ft, v: initial(ft) };
    return new PRecord(t, f);
  }
  return undefined;
}

function clone(v) {
  if (v instanceof PArray) return new PArray(v.t, v.dims, v.data.map((c) => ({ n: c.n, t: c.t, v: clone(c.v) })));
  if (v instanceof PRecord) {
    const f = Object.create(null);
    for (const k in v.f) f[k] = { n: v.f[k].n, t: v.f[k].t, v: clone(v.f[k].v) };
    return new PRecord(v.t, f);
  }
  if (v instanceof PSet) return new PSet(v.t, v.items.slice());
  return v;
}

function sameType(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (a.k === "array" && b.k === "array") return sameType(a.el, b.el);
  return false;
}

function coerce(v, t, name) {
  if (v === undefined) throw E(`No value to store in '${name}'`);
  if (!t) return clone(v);
  const bad = () => E(`Cannot store ${valueTypeName(v)} value ${describeValue(v)} in '${name}' of type ${typeName(t)}`);
  switch (t) {
    case "INTEGER":
      if (typeof v !== "number") throw bad();
      if (!Number.isInteger(v)) throw E(`Cannot store REAL value ${formatNum(v)} in INTEGER '${name}'. Use INT() or ROUND()`);
      return v;
    case "REAL":
      if (typeof v !== "number") throw bad();
      return v;
    case "STRING":
      if (typeof v !== "string") throw bad();
      return v;
    case "CHAR":
      if (typeof v !== "string" || v.length !== 1) throw E(`CHAR '${name}' must hold exactly one character, not ${describeValue(v)}`);
      return v;
    case "BOOLEAN":
      if (typeof v !== "boolean") throw bad();
      return v;
    case "DATE":
      if (v instanceof PDate) return v;
      if (typeof v === "string") { const d = parseDate(v); if (d) return d; }
      throw bad();
  }
  switch (t.k) {
    case "array":
      if (!(v instanceof PArray)) throw bad();
      if (!sameType(t.el, v.t.el)) throw E(`Cannot store ${typeName(v.t)} in '${name}' of type ${typeName(t)}`);
      if (t.dims && v.dims && t.dims.map((d) => d[1] - d[0]).join() !== v.dims.map((d) => d[1] - d[0]).join()) {
        throw E(`Cannot store ${typeName(v.t)} in '${name}' of type ${typeName(t)}: sizes differ`);
      }
      if (t.dims) {
        const c = clone(v);
        c.t = t; c.dims = t.dims;
        return c;
      }
      return clone(v);
    case "record":
      if (!(v instanceof PRecord) || v.t !== t) throw bad();
      return clone(v);
    case "enum":
      if (!(v instanceof PEnum) || v.t !== t) throw bad();
      return v;
    case "ptr":
      if (v === null) return null;
      if (!(v instanceof PPointer)) throw bad();
      if (v.c && v.c.t && t.to && typeName(v.c.t) !== typeName(t.to)) throw E(`Pointer type ${t.name} points to ${typeName(t.to)}, not ${typeName(v.c.t)}`);
      return v;
    case "set":
      if (!(v instanceof PSet) || v.t !== t) throw bad();
      return clone(v);
    case "class":
      if (v === null) return null;
      if (!(v instanceof PObject)) throw bad();
      for (let c = v.cls; c; c = c.parent) if (c === t) return v;
      throw E(`Cannot store a ${v.cls.name} object in '${name}' of type ${t.name}`);
  }
  return v;
}

function describeValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  return format(v);
}

function convertText(s, t, name, what) {
  const fail = (tn) => E(`${what}: "${s}" is not a valid ${tn} for '${name}'`);
  const trimmed = s.trim();
  if (!t) return isNumStr(trimmed) ? Number(trimmed) : s;
  switch (t) {
    case "INTEGER":
      if (!/^[+-]?\d+$/.test(trimmed)) throw fail("INTEGER");
      return Number(trimmed);
    case "REAL":
      if (!isNumStr(trimmed)) throw fail("REAL number");
      return Number(trimmed);
    case "BOOLEAN":
      if (/^true$/i.test(trimmed)) return true;
      if (/^false$/i.test(trimmed)) return false;
      throw fail("BOOLEAN (TRUE or FALSE)");
    case "CHAR":
      if (s.length !== 1) throw fail("CHAR (one character)");
      return s;
    case "STRING":
      return s;
    case "DATE": {
      const d = parseDate(trimmed);
      if (!d) throw fail("DATE (dd/mm/yyyy)");
      return d;
    }
  }
  if (t.k === "enum") {
    const e = t.vals.find((x) => x.name.toUpperCase() === trimmed.toUpperCase());
    if (!e) throw fail(t.name);
    return e;
  }
  throw E(`${what} cannot read directly into a ${typeName(t)} variable`);
}

function toJSON(v) {
  if (v instanceof PRecord) {
    const o = {};
    for (const [n, raw] of v.t.fields) o[raw] = v.f[n].v === undefined ? null : toJSON(v.f[n].v);
    return o;
  }
  if (v instanceof PDate) return v.toString();
  if (v instanceof PEnum) return v.name;
  if (v instanceof PArray) return v.data.map((c) => (c.v === undefined ? null : toJSON(c.v)));
  if (v instanceof PObject || v instanceof PPointer) throw E("Objects and pointers cannot be written to a file");
  return v;
}

function fromJSON(j, t, name) {
  if (j === null) return undefined;
  if (!t) return j;
  if (typeof t === "string") {
    if (t === "DATE") return parseDate(String(j)) ?? coerce(j, t, name);
    return coerce(j, t, name);
  }
  if (t.k === "record") {
    const r = initial(t);
    for (const [n, raw, ft] of t.fields) {
      const key = Object.keys(j).find((k) => k.toUpperCase() === n);
      if (key !== undefined && j[key] !== null) r.f[n].v = fromJSON(j[key], ft, raw);
    }
    return r;
  }
  if (t.k === "enum") return convertText(String(j), t, name, "GETRECORD");
  if (t.k === "array") {
    const a = initial(t);
    a.data.forEach((c, i) => { if (j[i] !== null && j[i] !== undefined) c.v = fromJSON(j[i], t.el, name); });
    return a;
  }
  return j;
}

function catPart(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || v instanceof PDate || v instanceof PEnum) return format(v);
  throw E(`'&' cannot join a ${valueTypeName(v)} value`);
}

function arith(a, b, op) {
  if (typeof a !== "number") throw E(`'${op}' needs numbers, but got ${valueTypeName(a)} ${describeValue(a)}`);
  if (typeof b !== "number") throw E(`'${op}' needs numbers, but got ${valueTypeName(b)} ${describeValue(b)}`);
  return 0;
}

function enumStep(e, n) {
  const i = e.i + n;
  if (!Number.isInteger(n) || i < 0 || i >= e.t.vals.length) throw E(`No ${e.t.name} value at position ${e.i + n + 1}`);
  return e.t.vals[i];
}

function kind(v) {
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "text";
  if (typeof v === "boolean") return "BOOLEAN";
  if (v instanceof PDate) return "DATE";
  if (v instanceof PEnum) return "enum";
  if (v === null) return "null";
  return "other";
}

function cmpCheck(a, b, op) {
  const ka = kind(a), kb = kind(b);
  if (ka === kb || ka === "null" || kb === "null") return;
  if ((a instanceof PPointer || a instanceof PObject) && kb === "null") return;
  throw E(`Cannot compare ${valueTypeName(a)} ${describeValue(a)} with ${valueTypeName(b)} ${describeValue(b)} using '${op}'`);
}

function equal(a, b) {
  if (a === b) return true;
  if (a instanceof PDate && b instanceof PDate) return a.ord() === b.ord();
  if (a instanceof PPointer && b instanceof PPointer) return a.c === b.c;
  if (a instanceof PRecord && b instanceof PRecord) {
    if (a.t !== b.t) return false;
    for (const k in a.f) if (!equal(a.f[k].v, b.f[k].v)) return false;
    return true;
  }
  return false;
}

function order(a, b, op) {
  const ka = kind(a), kb = kind(b);
  if (ka !== kb || ka === "BOOLEAN" || ka === "other" || ka === "null") {
    throw E(`Cannot compare ${valueTypeName(a)} ${describeValue(a)} with ${valueTypeName(b)} ${describeValue(b)} using '${op}'`);
  }
  if (ka === "number") return a - b;
  if (ka === "text") return a < b ? -1 : a > b ? 1 : 0;
  if (ka === "DATE") return a.ord() - b.ord();
  if (a.t !== b.t) throw E(`Cannot compare ${a.t.name} with ${b.t.name}`);
  return a.i - b.i;
}

function findMethod(cls, name) {
  for (let c = cls; c; c = c.parent) {
    const m = c.methods.get(name);
    if (m) return m;
  }
  return null;
}

function prepareClass(cls) {
  if (cls.fieldInfo) return;
  const chain = [];
  for (let c = cls; c; c = c.parent) chain.unshift(c);
  const info = new Map();
  for (const c of chain) {
    for (const [n, raw, t, priv] of c.fieldsThunk()) info.set(n, { raw, t, priv, cls: c });
  }
  cls.fieldInfo = info;
}

function checkArgs(m, args, raw) {
  if (m.nparams !== args.length) throw E(`${raw} expects ${m.nparams} argument${m.nparams === 1 ? "" : "s"} but ${args.length} given`);
}

export { BASIC };
