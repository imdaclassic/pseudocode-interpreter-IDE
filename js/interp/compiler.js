import { parse } from "./parser.js";
import { PseudoError } from "./errors.js";
import { BUILTINS, AS_ONLY_BUILTINS } from "./builtins.js";

// Compiles pseudocode source to the source of a JS async function `main(R)`.
// Throws PseudoError on the first syntax/semantic error.
export function compile(src, mode = "as") {
  const ast = parse(src, mode);
  const c = new Compiler(mode);
  return c.program(ast);
}

class Scope {
  constructor(parent, kind) {
    this.parent = parent;
    this.kind = kind; // 'global' | 'class' | 'func'
    this.names = new Map();
  }
  get(name) {
    for (let s = this; s; s = s.parent) {
      const e = s.names.get(name);
      if (e) return e;
    }
    return null;
  }
  getLocal(name) { return this.names.get(name) || null; }
  set(name, entry) { this.names.set(name, entry); }
}

const err = (msg, node) => new PseudoError(msg, node?.line ?? null, node?.col ?? null, node?.end ?? null);
const str = (s) => JSON.stringify(s);

class Compiler {
  constructor(mode) {
    this.as = mode === "as";
    this.types = new Map();   // NAME -> { kind, js, node }
    this.classes = new Map(); // NAME -> class node
    this.tmp = 0;
    this.curClass = null;     // class info while compiling methods
    this.curFunc = null;
  }

  t() { return `$${++this.tmp}`; }

  // ---------- program ----------
  program(ast) {
    const g = new Scope(null, "global");
    this.global = g;
    const decls = [], subs = [], typeNodes = [];
    const main = [];
    for (const s of ast.body) {
      if (s.type === "Procedure" || s.type === "Function") subs.push(s);
      else if (["RecordType", "EnumType", "PointerType", "SetType", "Class"].includes(s.type)) typeNodes.push(s);
      else main.push(s);
    }
    void decls;

    // Register types.
    for (const tn of typeNodes) {
      const name = tn.name.name;
      if (this.types.has(name)) throw err(`Type '${tn.name.raw}' is defined more than once`, tn.name);
      const kind = { RecordType: "record", EnumType: "enum", PointerType: "ptr", SetType: "set", Class: "class" }[tn.type];
      this.types.set(name, { kind, js: `T_${name}`, node: tn, raw: tn.name.raw });
      if (tn.type === "Class") this.classes.set(name, tn);
      if (tn.type === "EnumType") {
        tn.values.forEach((v, i) => {
          if (g.getLocal(v.name)) throw err(`'${v.raw}' is already defined`, v);
          g.set(v.name, { kind: "enumval", js: `T_${name}.vals[${i}]`, enumType: name });
        });
      }
    }
    for (const [name, info] of this.classes) {
      if (info.parent) {
        if (!this.classes.has(info.parent.name)) throw err(`Parent class '${info.parent.raw}' is not defined`, info.parent);
        // detect cycles
        const seen = new Set([name]);
        for (let p = info.parent; p; p = this.classes.get(p.name)?.parent) {
          if (seen.has(p.name)) throw err(`Class '${info.name.raw}' inherits from itself`, info.name);
          seen.add(p.name);
        }
      }
    }

    // Register subroutines.
    for (const s of subs) {
      const name = s.name.name;
      if (g.getLocal(name)) throw err(`'${s.name.raw}' is already defined`, s.name);
      g.set(name, { kind: "proc", js: `p_${name}`, node: s, isFunc: s.type === "Function", raw: s.name.raw });
    }

    // Register global variables (declared and implicit).
    this.collectVars(main, g, true);
    for (const s of main) this.collectImplicit(s, g);

    const out = [];
    out.push(`"use strict";`);
    out.push(`return async function main(R) {`);
    // global cells
    for (const [name, e] of g.names) {
      if (e.kind === "var") out.push(`let ${e.js} = R.cell(${str(e.raw)}, null);`);
    }
    // types
    for (const tn of typeNodes) out.push(this.typeDef(tn, g));
    // class methods
    for (const tn of typeNodes) if (tn.type === "Class") out.push(this.classMethods(tn, g));
    // subroutines
    for (const s of subs) out.push(this.subroutine(s, g, null));
    out.push(`R.L = 1;`);
    out.push(this.block(main, g));
    out.push(`};`);
    return out.join("\n");
  }

  // Collect DECLARE / CONSTANT / DEFINE in a list of statements (recursively into blocks).
  collectVars(stmts, sc, isGlobal) {
    for (const s of stmts) {
      switch (s.type) {
        case "Declare":
          for (const n of s.names) this.addVar(sc, n, s.vtype, false);
          break;
        case "Constant":
          this.addVar(sc, s.name, null, true);
          break;
        case "Define": {
          const t = this.types.get(s.setType.name);
          if (!t || t.kind !== "set") throw err(`'${s.setType.raw}' is not a SET type`, s.setType);
          this.addVar(sc, s.name, { kind: "named", name: s.setType.name }, false);
          break;
        }
        case "If": this.collectVars(s.then, sc, isGlobal); if (s.otherwise) this.collectVars(s.otherwise, sc, isGlobal); break;
        case "Case": for (const a of s.arms) this.collectVars(a.body, sc, isGlobal); if (s.otherwise) this.collectVars(s.otherwise, sc, isGlobal); break;
        case "For": case "While": case "Repeat": this.collectVars(s.body, sc, isGlobal); break;
        case "Procedure": case "Function":
          throw err(`${s.type.toUpperCase()} ${s.name.raw} must be defined at the top level, not inside another block`, s);
        case "RecordType": case "EnumType": case "PointerType": case "SetType": case "Class":
          throw err(`TYPE / CLASS definitions must be at the top level`, s);
      }
    }
  }

  addVar(sc, n, vtype, isConst) {
    const existing = sc.getLocal(n.name);
    if (existing) {
      if (existing.kind === "var" && !existing.isConst && !isConst && sameSpec(existing.type, vtype)) return; // re-declare same type (e.g. in a loop)
      throw err(`'${n.raw}' is already declared`, n);
    }
    if (this.types.has(n.name)) throw err(`'${n.raw}' is already used as a type name`, n);
    sc.set(n.name, { kind: "var", js: `v_${n.name}`, type: vtype, isConst, raw: n.raw });
  }

  // Variables that are assigned but never declared get created implicitly.
  collectImplicit(s, sc) {
    const target = (e) => {
      if (e && e.type === "Var" && !sc.get(e.name) && !this.types.has(e.name)) {
        sc.set(e.name, { kind: "var", js: `v_${e.name}`, type: null, isConst: false, raw: e.raw, implicit: true });
      }
    };
    switch (s.type) {
      case "Assign": target(s.target); break;
      case "Input": s.targets.forEach(target); break;
      case "ReadFile": case "GetRecord": target(s.target); break;
      case "For": target({ type: "Var", name: s.v.name, raw: s.v.raw }); s.body.forEach((x) => this.collectImplicit(x, sc)); break;
      case "If": s.then.forEach((x) => this.collectImplicit(x, sc)); s.otherwise?.forEach((x) => this.collectImplicit(x, sc)); break;
      case "Case": s.arms.forEach((a) => a.body.forEach((x) => this.collectImplicit(x, sc))); s.otherwise?.forEach((x) => this.collectImplicit(x, sc)); break;
      case "While": case "Repeat": s.body.forEach((x) => this.collectImplicit(x, sc)); break;
    }
  }

  // ---------- types ----------
  typeJs(spec, sc) {
    if (!spec) return "null";
    if (spec.kind === "basic") return str(spec.name);
    if (spec.kind === "array") {
      const dims = spec.dims ? `[${spec.dims.map(([l, h]) => `[${this.num(l, sc)}, ${this.num(h, sc)}]`).join(", ")}]` : "null";
      return `R.arrT(${dims}, ${this.typeJs(spec.elem, sc)})`;
    }
    const t = this.types.get(spec.name);
    if (!t) throw err(`Unknown data type '${spec.raw}'`, spec);
    return t.js;
  }

  typeDef(tn, sc) {
    const name = tn.name.name, js = `T_${name}`;
    switch (tn.type) {
      case "RecordType": {
        const seen = new Set();
        const fields = [];
        for (const d of tn.fields) {
          for (const n of d.names) {
            if (seen.has(n.name)) throw err(`Field '${n.raw}' is declared twice in TYPE ${tn.name.raw}`, n);
            seen.add(n.name);
            if (d.vtype.kind === "named" && d.vtype.name === name) throw err(`A record cannot contain itself (use a pointer)`, d.vtype);
            fields.push(`[${str(n.name)}, ${str(n.raw)}, ${this.typeJs(d.vtype, sc)}]`);
          }
        }
        return `const ${js} = R.recordType(${str(tn.name.raw)}, () => [${fields.join(", ")}]);`;
      }
      case "EnumType":
        return `const ${js} = R.enumType(${str(tn.name.raw)}, ${str(tn.values.map((v) => v.raw))});`;
      case "PointerType":
        return `const ${js} = R.ptrType(${str(tn.name.raw)}, () => ${this.typeJs(tn.target, sc)});`;
      case "SetType":
        return `const ${js} = R.setType(${str(tn.name.raw)}, () => ${this.typeJs(tn.elem, sc)});`;
      case "Class": {
        const fields = [];
        const seen = new Set();
        for (const f of tn.fields) {
          if (seen.has(f.name)) throw err(`Attribute '${f.raw}' is declared twice in CLASS ${tn.name.raw}`, f);
          seen.add(f.name);
          fields.push(`[${str(f.name)}, ${str(f.raw)}, ${this.typeJs(f.vtype, sc)}, ${f.access === "PRIVATE"}]`);
        }
        const parent = tn.parent ? `T_${tn.parent.name}` : "null";
        return `const ${js} = R.classType(${str(tn.name.raw)}, () => ${parent}, () => [${fields.join(", ")}]);`;
      }
    }
  }

  // Field/method info for class including ancestors: Map NAME -> {kind, ...}
  classMembers(name) {
    const chain = [];
    for (let c = this.classes.get(name); c; c = c.parent ? this.classes.get(c.parent.name) : null) chain.unshift(c);
    const fields = new Map(), methods = new Map();
    for (const c of chain) {
      for (const f of c.fields) fields.set(f.name, { decl: c.name.name, priv: f.access === "PRIVATE", type: f.vtype, raw: f.raw });
      for (const m of c.methods) methods.set(m.name.name, { decl: c.name.name, priv: m.access === "PRIVATE", node: m, isFunc: m.type === "Function", raw: m.name.raw });
    }
    return { fields, methods };
  }

  classMethods(tn, g) {
    const name = tn.name.name;
    const { fields, methods } = this.classMembers(name);
    const csc = new Scope(g, "class");
    for (const [fname, f] of fields) {
      csc.set(fname, { kind: "field", js: `self.f.${fname}`, type: f.type, raw: f.raw, decl: f.decl, priv: f.priv });
    }
    for (const [mname, m] of methods) {
      csc.set(mname, { kind: "method", raw: m.raw, isFunc: m.isFunc, decl: m.decl, priv: m.priv, node: m.node });
    }
    const out = [];
    const seen = new Set();
    for (const m of tn.methods) {
      if (seen.has(m.name.name)) throw err(`Method '${m.name.raw}' is defined twice in CLASS ${tn.name.raw}`, m.name);
      seen.add(m.name.name);
      if (m.name.name === "NEW" && m.type === "Function") throw err("The constructor NEW must be a PROCEDURE", m.name);
      this.curClass = { name, js: `T_${name}`, node: tn };
      const fn = this.subroutine(m, csc, this.curClass);
      this.curClass = null;
      const meta = `{ raw: ${str(m.name.raw)}, priv: ${m.access === "PRIVATE"}, isFunc: ${m.type === "Function"}, nparams: ${m.params.length} }`;
      out.push(`R.addMethod(T_${name}, ${str(m.name.name)}, ${meta}, ${fn});`);
    }
    return out.join("\n");
  }

  // ---------- subroutines ----------
  subroutine(s, parentScope, cls) {
    const sc = new Scope(parentScope, "func");
    const isFunc = s.type === "Function";
    const prologue = [];
    const argNames = [];
    s.params.forEach((p, i) => {
      if (sc.getLocal(p.name)) throw err(`Parameter '${p.raw}' is listed twice`, p);
      sc.set(p.name, { kind: "var", js: `v_${p.name}`, type: p.ptype, isConst: false, raw: p.raw, param: true });
      argNames.push(`a${i}`);
      const tjs = this.typeJs(p.ptype, sc);
      prologue.push(`let v_${p.name} = R.${p.byref ? "byref" : "byval"}(${str(p.raw)}, ${tjs}, a${i});`);
    });
    // locals
    const localsBefore = new Set(sc.names.keys());
    this.collectVars(s.body, sc, false);
    for (const st of s.body) this.collectImplicit(st, sc);
    for (const [name, e] of sc.names) {
      if (!localsBefore.has(name) && e.kind === "var") prologue.push(`let ${e.js} = R.cell(${str(e.raw)}, null);`);
    }
    const prevFunc = this.curFunc;
    this.curFunc = { isFunc, returns: s.returns, raw: s.name.raw };
    const body = this.block(s.body, sc);
    this.curFunc = prevFunc;
    const nargs = s.params.length;
    const header = cls
      ? `async function m_${cls.name}_${s.name.name}(self, ${argNames.join(", ")})`
      : `async function p_${s.name.name}(${argNames.join(", ")})`;
    const tail = isFunc ? `R.noReturn(${str(s.name.raw)});` : "";
    void nargs;
    return `${header} {\nif (++R.depth > R.maxDepth) R.tooDeep(${str(s.name.raw)});\ntry {\n${prologue.join("\n")}\n${body}\n${tail}\n} finally { R.depth--; }\n}`;
  }

  // ---------- statements ----------
  block(stmts, sc) {
    return stmts.map((s) => this.stmt(s, sc)).join("\n");
  }

  stmt(s, sc) {
    const L = `R.L = ${s.line};`;
    switch (s.type) {
      case "Declare":
        return L + s.names.map((n) => `${sc.get(n.name).js} = R.decl(${str(n.raw)}, ${this.typeJs(s.vtype, sc)});`).join(" ");
      case "Constant": {
        const e = sc.get(s.name.name);
        return `${L} ${e.js} = R.constant(${str(s.name.raw)}, ${this.expr(s.value, sc)});`;
      }
      case "Define": {
        const e = sc.get(s.name.name);
        return `${L} ${e.js} = R.defineSet(${str(s.name.raw)}, T_${s.setType.name}, [${s.values.map((v) => this.expr(v, sc)).join(", ")}]);`;
      }
      case "Assign": {
        this.checkAssign(s.target, s.value, sc);
        return `${L} R.set(${this.ref(s.target, sc)}, ${this.expr(s.value, sc)});`;
      }
      case "Input": {
        const prompt = s.prompt ? this.expr(s.prompt, sc) : "null";
        return L + s.targets.map((t) => ` await R.input(${this.ref(t, sc)}, ${prompt});`).join("");
      }
      case "Output":
        return `${L} R.output([${s.values.map((v) => this.expr(v, sc)).join(", ")}]);`;
      case "If": {
        const c = this.cond(s.cond, sc, "IF");
        let code = `${L} if (${c}) {\n${this.block(s.then, sc)}\n}`;
        if (s.otherwise) code += ` else {\n${this.block(s.otherwise, sc)}\n}`;
        return code;
      }
      case "Case": {
        const v = this.t();
        let code = `${L} { const ${v} = ${this.expr(s.subject, sc)};\n`;
        s.arms.forEach((a, i) => {
          const tests = a.labels.map((lb) =>
            lb.hi ? `R.inRange(${v}, ${this.expr(lb.lo, sc)}, ${this.expr(lb.hi, sc)})` : `R.caseEq(${v}, ${this.expr(lb.lo, sc)})`
          );
          code += `${i ? "else " : ""}if (${tests.join(" || ")}) {\n${this.block(a.body, sc)}\n}\n`;
        });
        if (s.otherwise) code += s.arms.length ? `else {\n${this.block(s.otherwise, sc)}\n}` : `{\n${this.block(s.otherwise, sc)}\n}`;
        return code + "}";
      }
      case "For": {
        const ve = sc.get(s.v.name);
        if (ve && ve.kind === "var" && ve.isConst) throw err(`Cannot use constant '${s.v.raw}' as a loop variable`, s.v);
        const cell = this.ref({ type: "Var", name: s.v.name, raw: s.v.raw, line: s.v.line, col: s.v.col, end: s.v.end }, sc);
        const c = this.t(), i = this.t(), to = this.t(), st = this.t();
        return `${L} { const ${c} = ${cell}; const ${to} = R.num(${this.expr(s.to, sc)}, "FOR ... TO"); const ${st} = ${s.step ? `R.step(${this.expr(s.step, sc)})` : "1"};
for (let ${i} = R.forStart(${c}, ${this.expr(s.from, sc)}); ${st} > 0 ? ${i} <= ${to} : ${i} >= ${to}; ${i} += ${st}) { ${c}.v = ${i};
${this.block(s.body, sc)}
} }`;
      }
      case "While":
        return `${L} while ((R.L = ${s.line}, ${this.cond(s.cond, sc, "WHILE")})) {\n${this.block(s.body, sc)}\n}`;
      case "Repeat":
        return `${L} do {\n${this.block(s.body, sc)}\nR.L = ${s.cond.line};} while (!(${this.cond(s.cond, sc, "UNTIL")}));`;
      case "Return": {
        if (!s.value) return `${L} return;`;
        const f = this.curFunc;
        const rt = this.staticType(s.value, sc);
        if (f.returns?.kind === "basic" && !compatible(f.returns.name, rt, s.value)) {
          throw err(`FUNCTION ${f.raw} RETURNS ${f.returns.name} but this returns a ${rt} value`, s.value);
        }
        return `${L} return R.ret(${this.expr(s.value, sc)}, ${this.typeJs(f.returns, sc)}, ${str(f.raw)});`;
      }
      case "CallStmt":
        return `${L} ${this.call(s.call, sc, true)};`;
      case "OpenFile":
        return `${L} R.openFile(${this.expr(s.file, sc)}, ${str(s.mode)});`;
      case "ReadFile":
        return `${L} R.readFile(${this.expr(s.file, sc)}, ${this.ref(s.target, sc)});`;
      case "WriteFile":
        return `${L} R.writeFile(${this.expr(s.file, sc)}, ${this.expr(s.target, sc)});`;
      case "CloseFile":
        return `${L} R.closeFile(${this.expr(s.file, sc)});`;
      case "Seek":
        return `${L} R.seek(${this.expr(s.file, sc)}, ${this.expr(s.target, sc)});`;
      case "GetRecord":
        return `${L} R.getRecord(${this.expr(s.file, sc)}, ${this.ref(s.target, sc)});`;
      case "PutRecord":
        return `${L} R.putRecord(${this.expr(s.file, sc)}, ${this.expr(s.target, sc)});`;
      case "Procedure": case "Function":
        throw err(`${s.type.toUpperCase()} ${s.name.raw} must be defined at the top level`, s);
      case "RecordType": case "EnumType": case "PointerType": case "SetType": case "Class":
        throw err(`TYPE / CLASS definitions must be at the top level`, s);
      default:
        throw err(`Unsupported statement ${s.type}`, s);
    }
  }

  checkAssign(target, value, sc) {
    const tt = this.staticType(target, sc);
    const vt = this.staticType(value, sc);
    if (!compatible(tt, vt, value)) {
      let hint = "";
      if (tt === "INTEGER" && vt === "REAL") hint = ". Use DIV for whole-number division, or INT() / ROUND()";
      if (tt === "STRING" && (vt === "INTEGER" || vt === "REAL")) hint = ". Use NUM_TO_STR() to convert";
      if ((tt === "INTEGER" || tt === "REAL") && vt === "STRING") hint = ". Use STR_TO_NUM() to convert";
      throw err(`Cannot assign a ${vt} value to ${describeTarget(target)} of type ${tt}${hint}`, value);
    }
  }

  cond(e, sc, what) {
    const t = this.staticType(e, sc);
    if (t && t !== "BOOLEAN") throw err(`The ${what} condition must be TRUE or FALSE (BOOLEAN), not ${t}`, e);
    return `R.bool(${this.expr(e, sc)}, ${str(what)})`;
  }

  num(e, sc) { return `R.num(${this.expr(e, sc)})`; }

  // ---------- references (assignable cells) ----------
  ref(e, sc) {
    switch (e.type) {
      case "Var": {
        const v = sc.get(e.name);
        if (!v) throw err(`'${e.raw}' has not been declared`, e);
        if (v.kind === "var") {
          if (v.isConst) throw err(`Cannot change the value of constant '${e.raw}'`, e);
          return v.js;
        }
        if (v.kind === "field") {
          this.checkFieldAccess(v, e);
          return v.js;
        }
        if (v.kind === "enumval") throw err(`Cannot assign to enumeration value '${e.raw}'`, e);
        if (v.kind === "proc" || v.kind === "method") throw err(`'${e.raw}' is a ${v.isFunc ? "FUNCTION" : "PROCEDURE"}, not a variable`, e);
        throw err(`Cannot assign to '${e.raw}'`, e);
      }
      case "Index": {
        const base = this.expr(e.target, sc);
        const name = str(exprName(e.target));
        if (e.idx.length === 1) return `R.el1(${base}, ${this.expr(e.idx[0], sc)}, ${name})`;
        if (e.idx.length === 2) return `R.el2(${base}, ${this.expr(e.idx[0], sc)}, ${this.expr(e.idx[1], sc)}, ${name})`;
        return `R.el(${base}, [${e.idx.map((x) => this.expr(x, sc)).join(", ")}], ${name})`;
      }
      case "Member":
        return `R.fieldRef(${this.expr(e.target, sc)}, ${str(e.name)}, ${str(e.raw)}, ${this.ctx()})`;
      case "Deref":
        return `R.deref(${this.expr(e.target, sc)})`;
      default:
        throw err("This cannot be assigned to", e);
    }
  }

  ctx() { return this.curClass ? this.curClass.js : "null"; }

  checkFieldAccess(v, e) {
    if (v.priv && this.curClass && v.decl !== this.curClass.name) {
      throw err(`'${e.raw}' is PRIVATE in class ${this.classes.get(v.decl).name.raw} and cannot be used in a subclass. Use a public method instead`, e);
    }
  }

  // ---------- expressions ----------
  expr(e, sc) {
    switch (e.type) {
      case "Num": return String(e.v);
      case "Str": case "Char": return str(e.v);
      case "Bool": return e.v ? "true" : "false";
      case "Paren": return `(${this.expr(e.e, sc)})`;
      case "Var": {
        const v = sc.get(e.name);
        if (v) {
          if (v.kind === "var") return `R.g(${v.js})`;
          if (v.kind === "field") { this.checkFieldAccess(v, e); return `R.g(${v.js})`; }
          if (v.kind === "enumval") return v.js;
          if (v.kind === "proc" || v.kind === "method") return this.call({ type: "Call", callee: e, args: [], line: e.line, col: e.col }, sc, false);
        }
        if (BUILTINS[e.name]) return this.call({ type: "Call", callee: e, args: [], line: e.line, col: e.col }, sc, false);
        if (this.types.has(e.name)) throw err(`'${e.raw}' is a type, not a value`, e);
        throw err(`'${e.raw}' has not been declared`, e);
      }
      case "Index": {
        const base = this.expr(e.target, sc);
        const name = str(exprName(e.target));
        if (e.idx.length === 1) return `R.ge1(${base}, ${this.expr(e.idx[0], sc)}, ${name})`;
        if (e.idx.length === 2) return `R.ge2(${base}, ${this.expr(e.idx[0], sc)}, ${this.expr(e.idx[1], sc)}, ${name})`;
        return `R.g(R.el(${base}, [${e.idx.map((x) => this.expr(x, sc)).join(", ")}], ${name}))`;
      }
      case "Member":
        return `R.member(${this.expr(e.target, sc)}, ${str(e.name)}, ${str(e.raw)}, ${this.ctx()})`;
      case "Deref":
        return `R.g(R.deref(${this.expr(e.target, sc)}))`;
      case "AddrOf":
        return `R.addr(${this.ref(e.target, sc)})`;
      case "Call": case "SuperCall": case "New":
        return this.call(e, sc, false);
      case "Un":
        if (e.op === "NOT") {
          const t = this.staticType(e.e, sc);
          if (t && t !== "BOOLEAN") throw err(`NOT needs a BOOLEAN value, not ${t}`, e);
          return `!R.bool(${this.expr(e.e, sc)}, "NOT")`;
        }
        return `R.neg(${this.expr(e.e, sc)})`;
      case "Bin": return this.bin(e, sc);
      default:
        throw err(`Unsupported expression ${e.type}`, e);
    }
  }

  bin(e, sc) {
    const l = this.expr(e.l, sc), r = this.expr(e.r, sc);
    const lt = this.staticType(e.l, sc), rt = this.staticType(e.r, sc);
    const numeric = (t) => t === "INTEGER" || t === "REAL";
    const textual = (t) => t === "STRING" || t === "CHAR";
    switch (e.op) {
      case "+": case "-": case "*": case "/": case "DIV": case "MOD": case "^": {
        for (const [t, side] of [[lt, e.l], [rt, e.r]]) {
          if (t && !numeric(t) && t !== "DATE") {
            const hint = e.op === "+" && textual(t) ? ". Use & to join strings" : "";
            throw err(`'${e.op}' needs numbers, but this is a ${t}${hint}`, side);
          }
        }
        const fn = { "+": "add", "-": "sub", "*": "mul", "/": "div", DIV: "idiv", MOD: "mod", "^": "pow" }[e.op];
        return `R.${fn}(${l}, ${r})`;
      }
      case "&": return `R.cat(${l}, ${r})`;
      case "=": case "<>": case "<": case ">": case "<=": case ">=": {
        if (lt && rt && !comparable(lt, rt)) throw err(`Cannot compare ${lt} with ${rt}`, e);
        const fn = { "=": "eq", "<>": "ne", "<": "lt", ">": "gt", "<=": "le", ">=": "ge" }[e.op];
        return `R.${fn}(${l}, ${r})`;
      }
      case "AND": case "OR": {
        for (const [t, side] of [[lt, e.l], [rt, e.r]]) {
          if (t && t !== "BOOLEAN") throw err(`${e.op} needs BOOLEAN values, not ${t}`, side);
        }
        return `(R.bool(${l}, "${e.op}") ${e.op === "AND" ? "&&" : "||"} R.bool(${r}, "${e.op}"))`;
      }
      case "IN": return `R.inSet(${l}, ${r})`;
    }
    throw err(`Unknown operator ${e.op}`, e);
  }

  // Compile arguments as cells (BYREF needs the caller's storage).
  argCells(args, sc) {
    return args.map((a) => {
      if (a.type === "Var") {
        const v = sc.get(a.name);
        if (v && v.kind === "var" && !v.isConst) return v.js;
        if (v && v.kind === "field") { this.checkFieldAccess(v, a); return v.js; }
      }
      if (a.type === "Index" || a.type === "Member" || a.type === "Deref") return this.ref(a, sc);
      return `R.tmp(${this.expr(a, sc)})`;
    });
  }

  call(e, sc, isStmt) {
    if (e.type === "New") {
      const t = this.types.get(e.cls.name);
      if (!t || t.kind !== "class") throw err(`'${e.cls.raw}' is not a CLASS`, e.cls);
      return `(await R.newObj(${t.js}, [${this.argCells(e.args, sc).join(", ")}], ${this.ctx()}))`;
    }
    if (e.type === "SuperCall") {
      if (!this.curClass) throw err("SUPER can only be used inside a class method", e);
      const cls = this.curClass.node;
      if (!cls.parent) throw err(`CLASS ${cls.name.raw} has no parent class (INHERITS) to call SUPER on`, e);
      return `(await R.callSuper(self, ${this.curClass.js}, ${str(e.method)}, ${str(e.raw)}, [${this.argCells(e.args, sc).join(", ")}]))`;
    }
    const callee = e.callee;
    if (callee.type === "Member") {
      const obj = this.expr(callee.target, sc);
      return `(await R.callMethod(${obj}, ${str(callee.name)}, ${str(callee.raw)}, [${this.argCells(e.args, sc).join(", ")}], ${this.ctx()}, ${isStmt}))`;
    }
    if (callee.type !== "Var") throw err("This cannot be called", e);
    const name = callee.name;
    const v = sc.get(name);
    if (v && v.kind === "method") {
      if (v.priv && v.decl !== this.curClass.name) throw err(`Method '${callee.raw}' is PRIVATE in class ${this.classes.get(v.decl).name.raw}`, callee);
      this.checkCallKind(v.isFunc, isStmt, callee.raw, callee);
      this.checkArgCount(v.node.params.length, e.args.length, callee.raw, callee);
      return `(await R.callMethod(self, ${str(name)}, ${str(callee.raw)}, [${this.argCells(e.args, sc).join(", ")}], ${this.ctx()}, ${isStmt}))`;
    }
    if (v && v.kind === "proc") {
      const node = v.node;
      this.checkCallKind(v.isFunc, isStmt, callee.raw, callee);
      this.checkArgCount(node.params.length, e.args.length, callee.raw, callee);
      node.params.forEach((p, i) => {
        const a = e.args[i];
        if (p.byref && !["Var", "Index", "Member", "Deref"].includes(a.type)) {
          throw err(`Parameter ${p.raw} of ${callee.raw} is BYREF, so the argument must be a variable`, a);
        }
        if (p.ptype.kind === "basic") {
          const at = this.staticType(a, sc);
          if (!compatible(p.ptype.name, at, a)) throw err(`Argument ${i + 1} of ${callee.raw} should be ${p.ptype.name} but is ${at}`, a);
        }
      });
      return `(await ${v.js}(${this.argCells(e.args, sc).join(", ")}))`;
    }
    if (v && v.kind !== "proc") {
      throw err(`'${callee.raw}' is a variable, not a procedure or function`, callee);
    }
    const b = BUILTINS[name];
    if (b) {
      if (!this.as && AS_ONLY_BUILTINS.has(name)) throw err(`${callee.raw}() is only available in AS & A Level mode`, callee);
      if (isStmt) throw err(`${callee.raw}() is a built-in FUNCTION; use its result in an expression (e.g. x <- ${callee.raw}(...))`, callee);
      const [min, max] = b.arity;
      if (e.args.length < min || e.args.length > max) {
        const want = min === max ? `${min}` : `${min} to ${max}`;
        throw err(`${callee.raw}() takes ${want} argument${max === 1 ? "" : "s"} but ${e.args.length} given`, callee);
      }
      return `R.b.${name}(${e.args.map((a) => this.expr(a, sc)).join(", ")})`;
    }
    throw err(`'${callee.raw}' is not a known procedure or function`, callee);
  }

  checkCallKind(isFunc, isStmt, raw, node) {
    if (isFunc && isStmt) throw err(`${raw} is a FUNCTION; use its result in an expression instead of CALL`, node);
    if (!isFunc && !isStmt) throw err(`${raw} is a PROCEDURE and does not return a value. Use CALL ${raw}(...)`, node);
  }
  checkArgCount(want, got, raw, node) {
    if (want !== got) throw err(`${raw} expects ${want} argument${want === 1 ? "" : "s"} but ${got} given`, node);
  }

  // ---------- static types (best effort, null = unknown) ----------
  staticType(e, sc) {
    switch (e.type) {
      case "Num": return e.real ? "REAL" : "INTEGER";
      case "Str": return "STRING";
      case "Char": return "CHAR";
      case "Bool": return "BOOLEAN";
      case "Paren": return this.staticType(e.e, sc);
      case "Var": {
        const v = sc.get(e.name);
        if (!v) return null;
        if ((v.kind === "var" || v.kind === "field") && v.type?.kind === "basic") return v.type.name;
        if (v.kind === "proc" && v.isFunc && v.node.returns?.kind === "basic") return v.node.returns.name;
        return null;
      }
      case "Index": {
        if (e.target.type === "Var") {
          const v = sc.get(e.target.name);
          if (v && (v.kind === "var" || v.kind === "field") && v.type?.kind === "array" && v.type.elem.kind === "basic") return v.type.elem.name;
        }
        return null;
      }
      case "Un":
        if (e.op === "NOT") return "BOOLEAN";
        return this.staticType(e.e, sc);
      case "Bin": {
        const lt = this.staticType(e.l, sc), rt = this.staticType(e.r, sc);
        switch (e.op) {
          case "+": case "-": case "*":
            if (lt === "REAL" || rt === "REAL") return "REAL";
            if (lt === "INTEGER" && rt === "INTEGER") return "INTEGER";
            return null;
          case "/": return "REAL";
          case "DIV": case "MOD": return "INTEGER";
          case "^": return lt === "REAL" || rt === "REAL" ? "REAL" : null;
          case "&": return "STRING";
          default: return "BOOLEAN";
        }
      }
      case "Call": {
        if (e.callee.type === "Var") {
          const v = sc.get(e.callee.name);
          if (v && v.kind === "proc" && v.isFunc && v.node.returns?.kind === "basic") return v.node.returns.name;
          if (!v && BUILTINS[e.callee.name]) return BUILTINS[e.callee.name].returns || null;
        }
        return null;
      }
      default: return null;
    }
  }
}

function compatible(target, src, valueNode) {
  if (!target || !src || target === src) return true;
  if (target === "REAL" && src === "INTEGER") return true;
  if (target === "STRING" && src === "CHAR") return true;
  if (target === "CHAR" && src === "STRING") return valueNode?.type !== "Str" || valueNode.v.length === 1;
  return false;
}

function comparable(a, b) {
  const num = (t) => t === "INTEGER" || t === "REAL";
  const txt = (t) => t === "STRING" || t === "CHAR";
  return a === b || (num(a) && num(b)) || (txt(a) && txt(b));
}

function sameSpec(a, b) {
  return JSON.stringify(stripPos(a)) === JSON.stringify(stripPos(b));
}
function stripPos(x) {
  if (!x || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(stripPos);
  const o = {};
  for (const k of Object.keys(x)) if (!["line", "col", "end"].includes(k)) o[k] = stripPos(x[k]);
  return o;
}

function exprName(e) {
  if (e.type === "Var") return e.raw;
  if (e.type === "Member") return `${exprName(e.target)}.${e.raw}`;
  if (e.type === "Index") return `${exprName(e.target)}[...]`;
  return "array";
}
function describeTarget(e) {
  if (e.type === "Var") return `'${e.raw}'`;
  return `'${exprName(e)}'`;
}
