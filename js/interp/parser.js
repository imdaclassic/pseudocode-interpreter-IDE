import { lex, HARD_KEYWORDS } from "./lexer.js";
import { PseudoError } from "./errors.js";

const BASIC_TYPES = new Set(["INTEGER", "REAL", "STRING", "CHAR", "BOOLEAN", "DATE"]);

// Recursive-descent parser. Produces an AST; every node has .line (1-based).
// mode: "igcse" | "as". AS-only features are rejected in IGCSE mode.
export function parse(src, mode = "as") {
  return new Parser(lex(src), mode).program();
}

class Parser {
  constructor(toks, mode) {
    this.toks = toks;
    this.p = 0;
    this.as = mode === "as";
    this.inClass = null;
    this.inFunc = null; // "PROCEDURE" | "FUNCTION" | null
  }

  // ---- token helpers ----
  get tok() { return this.toks[this.p]; }
  peek(k = 1) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  isOp(v, t = this.tok) { return t.t === "op" && t.v === v; }
  isKw(v, t = this.tok) { return t.t === "word" && t.v === v; }
  eatOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  eatKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
  skipNL() { while (this.tok.t === "nl") this.p++; }
  nextNonNL() { let k = this.p; while (this.toks[k].t === "nl") k++; return this.toks[k]; }

  err(msg, t = this.tok) {
    return new PseudoError(msg, t.line, t.col, Math.max(t.end, t.col + 1));
  }
  describe(t = this.tok) {
    if (t.t === "nl") return "end of line";
    if (t.t === "eof") return "end of program";
    if (t.t === "str") return `"${t.v}"`;
    return `'${t.raw}'`;
  }
  expectOp(v, ctx) {
    if (!this.eatOp(v)) throw this.err(`Expected '${v}'${ctx ? " " + ctx : ""} but found ${this.describe()}`);
  }
  expectKw(v, ctx) {
    if (!this.eatKw(v)) throw this.err(`Expected ${v}${ctx ? " " + ctx : ""} but found ${this.describe()}`);
  }
  ident(what = "an identifier") {
    const t = this.tok;
    if (t.t !== "word") throw this.err(`Expected ${what} but found ${this.describe()}`);
    if (HARD_KEYWORDS.has(t.v)) throw this.err(`'${t.raw}' is a keyword and cannot be used as ${what}`);
    this.p++;
    return { name: t.v, raw: t.raw, line: t.line, col: t.col, end: t.end };
  }
  // Any word, keyword or not (used after '.').
  member() {
    const t = this.tok;
    if (t.t !== "word") throw this.err(`Expected a field or method name after '.' but found ${this.describe()}`);
    this.p++;
    return { name: t.v, raw: t.raw };
  }
  endOfStatement() {
    const t = this.tok;
    if (t.t === "nl" || t.t === "eof") return;
    throw this.err(`Unexpected ${this.describe()}. Each statement must be on its own line`);
  }
  requireAS(feature, t = this.tok) {
    if (!this.as) throw this.err(`${feature} is only available in AS & A Level mode`, t);
  }
  node(type, t, props) { return { type, line: t.line, col: t.col, ...props }; }

  // ---- program & blocks ----
  program() {
    const body = this.block([]);
    if (this.tok.t !== "eof") throw this.err(`Unexpected ${this.describe()}`);
    return { type: "Program", body };
  }

  // Parse statements until one of the terminator keywords (at statement start) or EOF.
  block(terms) {
    const stmts = [];
    for (;;) {
      this.skipNL();
      const t = this.tok;
      if (t.t === "eof") return stmts;
      if (t.t === "word" && terms.includes(t.v)) return stmts;
      stmts.push(this.statement());
    }
  }

  blockUntil(terms, opener, endName = terms[terms.length - 1]) {
    const body = this.block(terms);
    if (this.tok.t === "eof") {
      throw new PseudoError(`${opener.v} on line ${opener.line} is missing its ${endName}`, opener.line, opener.col, opener.end);
    }
    return body;
  }

  statement() {
    const t = this.tok;
    if (t.t === "word") {
      // Soft keywords: treat as identifier when followed by assignment/index/field.
      const nx = this.peek();
      const looksLikeTarget = nx.t === "op" && (nx.v === "<-" || nx.v === "[" || (nx.v === "." && !HARD_KEYWORDS.has(t.v)));
      if (!looksLikeTarget || HARD_KEYWORDS.has(t.v)) {
        switch (t.v) {
          case "DECLARE": return this.declare();
          case "CONSTANT": return this.constant();
          case "INPUT": return this.input();
          case "OUTPUT": case "PRINT": return this.output();
          case "IF": return this.ifStmt();
          case "CASE": return this.caseStmt();
          case "FOR": return this.forStmt();
          case "WHILE": return this.whileStmt();
          case "REPEAT": return this.repeatStmt();
          case "PROCEDURE": case "FUNCTION": return this.subroutine(null);
          case "RETURN": return this.returnStmt();
          case "CALL": return this.callStmt();
          case "OPENFILE": return this.openFile();
          case "READFILE": case "WRITEFILE": case "GETRECORD": case "PUTRECORD": case "SEEK": return this.fileOp();
          case "CLOSEFILE": return this.closeFile();
          case "TYPE": if (nx.t === "word") return this.typeDef(); break;
          case "CLASS": if (nx.t === "word") return this.classDef(); break;
          case "DEFINE": if (nx.t === "word") return this.defineStmt(); break;
          case "PUBLIC": case "PRIVATE":
            throw this.err(`${t.v} can only be used inside a CLASS`);
          case "ELSE": case "ENDIF": case "ENDWHILE": case "UNTIL": case "NEXT": case "ENDFOR":
          case "ENDPROCEDURE": case "ENDFUNCTION": case "ENDCASE": case "OTHERWISE":
          case "ENDTYPE": case "ENDCLASS": case "THEN": case "ELSEIF":
            throw this.err(`${t.raw} without a matching opening statement`);
        }
      }
    }
    return this.assignOrCall();
  }

  // ---- declarations ----
  declare() {
    const kw = this.next();
    const names = [this.ident("a variable name")];
    while (this.eatOp(",")) names.push(this.ident("a variable name"));
    this.expectOp(":", "after the variable name in DECLARE");
    const vtype = this.typeSpec(false);
    this.endOfStatement();
    return this.node("Declare", kw, { names, vtype });
  }

  typeSpec(isParam) {
    const t = this.tok;
    if (t.t !== "word") throw this.err(`Expected a data type but found ${this.describe()}`);
    if (t.v === "ARRAY") {
      this.p++;
      let dims = null;
      if (this.isOp("[")) {
        dims = [];
        do {
          this.expectOp("[");
          do {
            const lo = this.expr();
            this.expectOp(":", "between array bounds (e.g. [1:10])");
            const hi = this.expr();
            dims.push([lo, hi]);
          } while (this.eatOp(","));
          this.expectOp("]", "to close the array bounds");
        } while (this.isOp("["));
        if (dims.length > 2 && !this.as) this.requireAS("Arrays with more than 2 dimensions", t);
      } else if (!isParam) {
        throw this.err("Array bounds are required, e.g. ARRAY[1:10] OF INTEGER");
      }
      this.expectKw("OF", "in the array type (ARRAY[...] OF type)");
      const elem = this.typeSpec(isParam);
      return { kind: "array", dims, elem, line: t.line };
    }
    this.p++;
    if (BASIC_TYPES.has(t.v)) {
      if (t.v === "DATE") this.requireAS("The DATE type", t);
      return { kind: "basic", name: t.v };
    }
    if (HARD_KEYWORDS.has(t.v)) throw this.err(`Expected a data type but found ${this.describe(t)}`, t);
    return { kind: "named", name: t.v, raw: t.raw, line: t.line, col: t.col, end: t.end };
  }

  constant() {
    const kw = this.next();
    const name = this.ident("a constant name");
    if (!this.eatOp("=") && !this.eatOp("<-")) throw this.err(`Expected '=' after CONSTANT ${name.raw}`);
    const value = this.expr();
    this.endOfStatement();
    return this.node("Constant", kw, { name, value });
  }

  typeDef() {
    const kw = this.next();
    this.requireAS("User-defined types (TYPE)", kw);
    const name = this.ident("a type name");
    if (this.eatOp("=")) {
      if (this.eatOp("(")) {
        const values = [this.ident("an enumeration value")];
        while (this.eatOp(",")) values.push(this.ident("an enumeration value"));
        this.expectOp(")", "to close the enumeration");
        this.endOfStatement();
        return this.node("EnumType", kw, { name, values });
      }
      if (this.eatOp("^")) {
        const target = this.typeSpec(false);
        this.endOfStatement();
        return this.node("PointerType", kw, { name, target });
      }
      if (this.isKw("SET")) {
        this.p++;
        this.expectKw("OF", "after SET");
        const elem = this.typeSpec(false);
        this.endOfStatement();
        return this.node("SetType", kw, { name, elem });
      }
      throw this.err("Expected '(' (enumeration), '^' (pointer) or SET OF after '='");
    }
    this.endOfStatement();
    const fields = [];
    for (;;) {
      this.skipNL();
      if (this.eatKw("ENDTYPE")) break;
      if (this.tok.t === "eof") throw new PseudoError(`TYPE ${name.raw} is missing its ENDTYPE`, kw.line, kw.col, kw.end);
      if (!this.isKw("DECLARE")) throw this.err(`Expected DECLARE or ENDTYPE inside TYPE ${name.raw}`);
      fields.push(this.declare());
    }
    this.endOfStatement();
    return this.node("RecordType", kw, { name, fields });
  }

  defineStmt() {
    const kw = this.next();
    this.requireAS("Sets (DEFINE)", kw);
    const name = this.ident("a set name");
    this.expectOp("(", "after the set name in DEFINE");
    const values = [];
    if (!this.isOp(")")) {
      do values.push(this.expr()); while (this.eatOp(","));
    }
    this.expectOp(")", "to close the set values");
    this.expectOp(":", "before the set type name");
    const setType = this.ident("a set type name");
    this.endOfStatement();
    return this.node("Define", kw, { name, values, setType });
  }

  classDef() {
    const kw = this.next();
    this.requireAS("Classes", kw);
    const name = this.ident("a class name");
    let parent = null;
    if (this.eatKw("INHERITS")) parent = this.ident("a parent class name");
    this.endOfStatement();
    const fields = [], methods = [];
    const prev = this.inClass;
    this.inClass = name.name;
    for (;;) {
      this.skipNL();
      if (this.eatKw("ENDCLASS")) break;
      const t = this.tok;
      if (t.t === "eof") throw new PseudoError(`CLASS ${name.raw} is missing its ENDCLASS`, kw.line, kw.col, kw.end);
      let access = "PUBLIC";
      if (this.isKw("PUBLIC") || this.isKw("PRIVATE")) { access = this.next().v; }
      if (this.isKw("PROCEDURE") || this.isKw("FUNCTION")) {
        const m = this.subroutine(access);
        methods.push(m);
        continue;
      }
      if (this.isKw("DECLARE")) this.p++;
      const fnames = [this.ident("an attribute name")];
      while (this.eatOp(",")) fnames.push(this.ident("an attribute name"));
      this.expectOp(":", "after the attribute name");
      const vtype = this.typeSpec(false);
      this.endOfStatement();
      for (const f of fnames) fields.push({ ...f, vtype, access, line: f.line });
    }
    this.inClass = prev;
    this.endOfStatement();
    return this.node("Class", kw, { name, parent, fields, methods });
  }

  subroutine(access) {
    const kw = this.next();
    const isFunc = kw.v === "FUNCTION";
    if (this.inFunc) throw this.err(`A ${kw.v} cannot be defined inside another procedure or function`, kw);
    const nameTok = this.tok;
    let name;
    if (nameTok.t === "word" && (nameTok.v === "NEW" || !HARD_KEYWORDS.has(nameTok.v))) {
      this.p++;
      name = { name: nameTok.v, raw: nameTok.raw, line: nameTok.line, col: nameTok.col, end: nameTok.end };
    } else name = this.ident(`a ${kw.v.toLowerCase()} name`);
    const params = [];
    if (this.eatOp("(")) {
      let mode = "BYVAL";
      if (!this.isOp(")")) {
        do {
          if (this.isKw("BYREF") || this.isKw("BYVAL")) {
            const m = this.next();
            this.requireAS("BYREF / BYVAL", m);
            mode = m.v;
          }
          const pname = this.ident("a parameter name");
          this.expectOp(":", `after parameter ${pname.raw} (e.g. ${pname.raw} : INTEGER)`);
          const ptype = this.typeSpec(true);
          params.push({ ...pname, ptype, byref: mode === "BYREF" });
        } while (this.eatOp(","));
      }
      this.expectOp(")", "to close the parameter list");
    }
    let returns = null;
    if (isFunc) {
      this.expectKw("RETURNS", `after FUNCTION ${name.raw}(...)`);
      returns = this.typeSpec(true);
    } else if (this.isKw("RETURNS")) {
      throw this.err("A PROCEDURE cannot return a value. Use FUNCTION instead");
    }
    this.endOfStatement();
    const end = isFunc ? "ENDFUNCTION" : "ENDPROCEDURE";
    this.inFunc = kw.v;
    const body = this.blockUntil([end], kw);
    this.inFunc = null;
    this.p++;
    this.endOfStatement();
    return this.node(isFunc ? "Function" : "Procedure", kw, { name, params, returns, body, access });
  }

  // ---- I/O ----
  input() {
    const kw = this.next();
    let prompt = null;
    if (this.tok.t === "str") {
      prompt = this.expr();
      this.eatOp(",");
    }
    const targets = [this.lvalue()];
    while (this.eatOp(",")) targets.push(this.lvalue());
    this.endOfStatement();
    return this.node("Input", kw, { prompt, targets });
  }

  output() {
    const kw = this.next();
    const values = [];
    if (this.tok.t !== "nl" && this.tok.t !== "eof") {
      do values.push(this.expr()); while (this.eatOp(","));
    }
    this.endOfStatement();
    return this.node("Output", kw, { values });
  }

  // ---- control flow ----
  ifStmt() {
    const kw = this.next();
    const cond = this.expr();
    this.skipNL();
    this.expectKw("THEN", `after the IF condition`);
    const then = this.blockUntil(["ELSE", "ELSEIF", "ENDIF"], { ...kw, v: "IF" });
    let otherwise = null;
    const t = this.tok;
    if (this.isKw("ELSEIF") || (this.isKw("ELSE") && this.isKw("IF", this.peek()))) {
      if (this.isKw("ELSE")) this.p++;
      // ELSE IF / ELSEIF chain shares the single ENDIF.
      otherwise = [this.ifStmtChained()];
      return this.node("If", kw, { cond, then, otherwise });
    }
    if (this.eatKw("ELSE")) {
      otherwise = this.blockUntil(["ENDIF"], { ...kw, v: "IF" });
    }
    this.expectKw("ENDIF", `to close IF on line ${kw.line}`);
    this.endOfStatement();
    void t;
    return this.node("If", kw, { cond, then, otherwise });
  }

  ifStmtChained() {
    const kw = this.next(); // IF or ELSEIF
    const cond = this.expr();
    this.skipNL();
    this.expectKw("THEN", "after the ELSE IF condition");
    const then = this.blockUntil(["ELSE", "ELSEIF", "ENDIF"], { ...kw, v: "IF" });
    let otherwise = null;
    if (this.isKw("ELSEIF") || (this.isKw("ELSE") && this.isKw("IF", this.peek()))) {
      if (this.isKw("ELSE")) this.p++;
      otherwise = [this.ifStmtChained()];
      return this.node("If", kw, { cond, then, otherwise });
    }
    if (this.eatKw("ELSE")) otherwise = this.blockUntil(["ENDIF"], { ...kw, v: "IF" });
    this.expectKw("ENDIF", `to close IF`);
    this.endOfStatement();
    return this.node("If", kw, { cond, then, otherwise });
  }

  caseStmt() {
    const kw = this.next();
    let subject;
    if (this.eatKw("OF")) subject = this.expr();
    else { subject = this.expr(); this.expectKw("OF", "in CASE OF <identifier>"); }
    this.endOfStatement();
    const arms = [];
    let otherwise = null;
    for (;;) {
      this.skipNL();
      if (this.eatKw("ENDCASE")) break;
      if (this.tok.t === "eof") throw new PseudoError(`CASE on line ${kw.line} is missing its ENDCASE`, kw.line, kw.col, kw.end);
      if (this.isKw("OTHERWISE")) {
        const ot = this.next();
        this.eatOp(":");
        otherwise = this.caseBody();
        void ot;
        continue;
      }
      const lt = this.tok;
      const labels = this.caseLabels();
      if (!labels) throw this.err(`Expected a CASE value followed by ':' but found ${this.describe(lt)}`, lt);
      arms.push({ labels, body: this.caseBody(), line: lt.line });
    }
    this.endOfStatement();
    return this.node("Case", kw, { subject, arms, otherwise });
  }

  // Tries to parse "v [TO v] {, v [TO v]} :". Returns null (and rewinds) if not a label.
  caseLabels() {
    const save = this.p;
    try {
      const labels = [];
      do {
        const start = this.tok;
        const lo = this.expr();
        if (this.isKw("TO")) {
          this.requireAS("CASE ranges (x TO y)", this.tok);
          this.p++;
          labels.push({ lo, hi: this.expr() });
        } else labels.push({ lo, hi: null });
        void start;
      } while (this.eatOp(","));
      if (!this.eatOp(":")) { this.p = save; return null; }
      return labels;
    } catch (e) {
      if (e instanceof PseudoError && /only available/.test(e.message)) throw e;
      this.p = save;
      return null;
    }
  }

  caseBody() {
    const stmts = [];
    // Statement may follow on the same line, then more lines until next label.
    for (;;) {
      if (this.tok.t === "nl") { this.skipNL(); }
      const t = this.tok;
      if (t.t === "eof" || this.isKw("ENDCASE") || this.isKw("OTHERWISE")) return stmts;
      if (stmts.length > 0 || t.line !== this.toks[this.p - 1]?.line) {
        // On a new line: is it a new label?
        if (this.isLabelAhead()) return stmts;
      }
      stmts.push(this.statement());
    }
  }

  isLabelAhead() {
    const save = this.p;
    const t = this.tok;
    // Statements starting with these keywords are never labels.
    if (t.t === "word" && HARD_KEYWORDS.has(t.v) && !["TRUE", "FALSE", "NOT"].includes(t.v)) return false;
    const r = this.caseLabels();
    this.p = save;
    return r !== null;
  }

  forStmt() {
    const kw = this.next();
    const v = this.ident("a loop variable");
    this.expectOp("<-", `after FOR ${v.raw}`);
    const from = this.expr();
    this.expectKw("TO", "in the FOR loop (FOR i <- 1 TO 10)");
    const to = this.expr();
    let step = null;
    if (this.eatKw("STEP")) step = this.expr();
    this.endOfStatement();
    const body = this.blockUntil(["NEXT", "ENDFOR"], kw, "NEXT");
    this.p++;
    if (this.tok.t === "word" && this.tok.t !== "nl") {
      const nv = this.ident("the loop variable after NEXT");
      if (nv.name !== v.name) throw new PseudoError(`NEXT ${nv.raw} does not match FOR ${v.raw}`, nv.line, nv.col, nv.end);
    }
    this.endOfStatement();
    return this.node("For", kw, { v, from, to, step, body });
  }

  whileStmt() {
    const kw = this.next();
    const cond = this.expr();
    if (this.tok.t === "nl" && this.isKw("DO", this.nextNonNL())) this.skipNL();
    this.eatKw("DO");
    this.endOfStatement();
    const body = this.blockUntil(["ENDWHILE"], kw);
    this.p++;
    this.endOfStatement();
    return this.node("While", kw, { cond, body });
  }

  repeatStmt() {
    const kw = this.next();
    this.endOfStatement();
    const body = this.blockUntil(["UNTIL"], kw);
    this.p++;
    const cond = this.expr();
    this.endOfStatement();
    return this.node("Repeat", kw, { cond, body });
  }

  returnStmt() {
    const kw = this.next();
    if (!this.inFunc) throw this.err("RETURN can only be used inside a FUNCTION", kw);
    let value = null;
    if (this.tok.t !== "nl" && this.tok.t !== "eof") value = this.expr();
    if (this.inFunc === "FUNCTION" && !value) throw this.err("RETURN in a FUNCTION needs a value", kw);
    if (this.inFunc === "PROCEDURE" && value) throw this.err("A PROCEDURE cannot RETURN a value. Use FUNCTION instead", kw);
    this.endOfStatement();
    return this.node("Return", kw, { value });
  }

  callStmt() {
    const kw = this.next();
    const target = this.postfix(this.primary(), true);
    let call = target;
    if (target.type !== "Call") call = { type: "Call", callee: target, args: [], line: target.line, col: target.col };
    this.endOfStatement();
    return this.node("CallStmt", kw, { call });
  }

  // ---- files ----
  openFile() {
    const kw = this.next();
    const file = this.expr();
    this.expectKw("FOR", "after the file name in OPENFILE");
    const m = this.tok;
    if (m.t !== "word" || !["READ", "WRITE", "APPEND", "RANDOM"].includes(m.v)) {
      throw this.err("Expected READ, WRITE, APPEND or RANDOM after FOR");
    }
    this.p++;
    if (m.v === "RANDOM") this.requireAS("Random-access files", m);
    this.endOfStatement();
    return this.node("OpenFile", kw, { file, mode: m.v });
  }

  fileOp() {
    const kw = this.next();
    if (["GETRECORD", "PUTRECORD", "SEEK"].includes(kw.v)) this.requireAS(`${kw.v} (random-access files)`, kw);
    const file = this.expr();
    this.expectOp(",", `after the file name in ${kw.v}`);
    const target = kw.v === "READFILE" || kw.v === "GETRECORD" ? this.lvalue() : this.expr();
    this.endOfStatement();
    return this.node(kw.v === "READFILE" ? "ReadFile" : kw.v === "WRITEFILE" ? "WriteFile" : kw.v === "SEEK" ? "Seek" : kw.v === "GETRECORD" ? "GetRecord" : "PutRecord", kw, { file, target });
  }

  closeFile() {
    const kw = this.next();
    const file = this.expr();
    this.endOfStatement();
    return this.node("CloseFile", kw, { file });
  }

  // ---- assignment / call statements ----
  assignOrCall() {
    const start = this.tok;
    const target = this.postfix(this.primary(), true);
    if (this.isOp("<-")) {
      this.p++;
      checkLvalue(target, this, start);
      const value = this.expr();
      this.endOfStatement();
      return this.node("Assign", start, { target, value });
    }
    if (this.isOp("=") && isLvalue(target)) {
      throw this.err("Use '<-' for assignment ('=' is for comparison)");
    }
    if (target.type === "Call" || target.type === "Member" || target.type === "SuperCall") {
      this.endOfStatement();
      const call = target.type === "Call" || target.type === "SuperCall" ? target : { type: "Call", callee: target, args: [], line: target.line, col: target.col };
      return this.node("CallStmt", start, { call, implicit: true });
    }
    if (target.type === "Var" && (this.tok.t === "nl" || this.tok.t === "eof")) {
      const call = { type: "Call", callee: target, args: [], line: target.line, col: target.col };
      return this.node("CallStmt", start, { call, implicit: true });
    }
    throw this.err(`Expected '<-' or a statement but found ${this.describe()}`, this.tok.t === "nl" ? start : this.tok);
  }

  lvalue() {
    const start = this.tok;
    const e = this.postfix(this.primary(), false);
    checkLvalue(e, this, start);
    return e;
  }

  // ---- expressions ----
  expr() { return this.orExpr(); }

  orExpr() {
    let l = this.andExpr();
    while (this.isKw("OR")) {
      const t = this.next();
      l = this.node("Bin", t, { op: "OR", l, r: this.andExpr() });
    }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.isKw("AND")) {
      const t = this.next();
      l = this.node("Bin", t, { op: "AND", l, r: this.notExpr() });
    }
    return l;
  }
  notExpr() {
    if (this.isKw("NOT")) {
      const t = this.next();
      return this.node("Un", t, { op: "NOT", e: this.notExpr() });
    }
    return this.cmpExpr();
  }
  cmpExpr() {
    let l = this.catExpr();
    for (;;) {
      const t = this.tok;
      if (t.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.v)) {
        this.p++;
        l = this.node("Bin", t, { op: t.v, l, r: this.catExpr() });
      } else if (this.isKw("IN") && this.as) {
        this.p++;
        l = this.node("Bin", t, { op: "IN", l, r: this.catExpr() });
      } else return l;
    }
  }
  catExpr() {
    let l = this.addExpr();
    while (this.isOp("&")) {
      const t = this.next();
      l = this.node("Bin", t, { op: "&", l, r: this.addExpr() });
    }
    return l;
  }
  addExpr() {
    let l = this.mulExpr();
    while (this.isOp("+") || this.isOp("-")) {
      const t = this.next();
      l = this.node("Bin", t, { op: t.v, l, r: this.mulExpr() });
    }
    return l;
  }
  mulExpr() {
    let l = this.unary();
    for (;;) {
      const t = this.tok;
      if (this.isOp("*") || this.isOp("/") || this.isKw("DIV") || this.isKw("MOD")) {
        if (t.t === "word" && this.isOp("(", this.peek()) && false) return l;
        this.p++;
        l = this.node("Bin", t, { op: t.v, l, r: this.unary() });
      } else return l;
    }
  }
  unary() {
    if (this.isOp("-") || this.isOp("+")) {
      const t = this.next();
      const e = this.unary();
      if (t.v === "+") return e;
      if (e.type === "Num") return { ...e, v: -e.v };
      return this.node("Un", t, { op: "-", e });
    }
    return this.power();
  }
  power() {
    const base = this.postfix(this.primary(), false);
    if (this.isOp("^") && this.caretIsPower()) {
      const t = this.next();
      return this.node("Bin", t, { op: "^", l: base, r: this.unary() });
    }
    return base;
  }
  // Decide whether '^' (at current position) is exponent or pointer dereference.
  caretIsPower() {
    const nx = this.peek();
    if (nx.t === "num" || nx.t === "str" || nx.t === "char") return true;
    if (nx.t === "op" && nx.v === "(") return true;
    if (nx.t === "op" && (nx.v === "-" || nx.v === "+")) return !nx.sp; // 2^-1 vs p^ - 1
    if (nx.t === "word" && !["AND", "OR", "DIV", "MOD", "THEN", "TO", "STEP", "DO", "OF", "IN"].includes(nx.v)) return true;
    return false;
  }

  primary() {
    const t = this.tok;
    switch (t.t) {
      case "num": this.p++; return this.node("Num", t, { v: t.v, real: t.real });
      case "str": this.p++; return this.node("Str", t, { v: t.v });
      case "char": this.p++; return this.node("Char", t, { v: t.v });
      case "op":
        if (t.v === "(") {
          this.p++;
          const e = this.expr();
          this.expectOp(")", "to close the bracket");
          return this.node("Paren", t, { e });
        }
        if (t.v === "^") {
          this.requireAS("Pointers", t);
          this.p++;
          const target = this.postfix(this.primary(), false);
          if (!isLvalue(target)) throw this.err("'^' must be followed by a variable to get its address", t);
          return this.node("AddrOf", t, { target });
        }
        throw this.err(`Expected a value but found ${this.describe()}`);
      case "word": {
        if (t.v === "TRUE" || t.v === "FALSE") { this.p++; return this.node("Bool", t, { v: t.v === "TRUE" }); }
        if ((t.v === "DIV" || t.v === "MOD") && this.isOp("(", this.peek())) {
          this.p++;
          return this.node("Var", t, { name: t.v, raw: t.raw, end: t.end });
        }
        if (t.v === "NEW" && this.peek().t === "word" && this.as) {
          this.p++;
          const cls = this.ident("a class name");
          const args = this.isOp("(") ? this.args() : [];
          return this.node("New", t, { cls, args });
        }
        if (t.v === "SUPER") {
          if (!this.inClass) throw this.err("SUPER can only be used inside a CLASS method");
          this.p++;
          this.expectOp(".", "after SUPER");
          const m = this.member();
          const args = this.isOp("(") ? this.args() : [];
          return this.node("SuperCall", t, { method: m.name, raw: m.raw, args });
        }
        if (HARD_KEYWORDS.has(t.v)) {
          throw this.err(`Expected a value but found the keyword ${t.raw}`);
        }
        this.p++;
        return this.node("Var", t, { name: t.v, raw: t.raw, end: t.end });
      }
      case "nl":
        throw this.err("Expression is incomplete: unexpected end of line");
      default:
        throw this.err(`Expected a value but found ${this.describe()}`);
    }
  }

  args() {
    this.expectOp("(");
    const args = [];
    if (!this.isOp(")")) {
      do args.push(this.expr()); while (this.eatOp(","));
    }
    this.expectOp(")", "to close the argument list");
    return args;
  }

  postfix(e, stmtStart) {
    for (;;) {
      const t = this.tok;
      if (this.isOp("[")) {
        this.p++;
        const idx = [];
        do idx.push(this.expr()); while (this.eatOp(","));
        this.expectOp("]", "to close the array index");
        if (e.type === "Index" && !e.closed2) {
          // A[i][j] is treated as A[i, j]
          e = { ...e, idx: [...e.idx, ...idx] };
        } else e = this.node("Index", t, { target: e, idx });
      } else if (this.isOp("(") && (e.type === "Var" || e.type === "Member")) {
        e = this.node("Call", t, { callee: e, args: this.args() });
        e.line = e.callee.line; e.col = e.callee.col;
      } else if (this.isOp(".")) {
        this.p++;
        const m = this.member();
        e = this.node("Member", t, { target: e, name: m.name, raw: m.raw });
      } else if (this.isOp("^") && (!this.caretIsPower() || stmtStart && this.isOp("<-", this.peek()))) {
        this.requireAS("Pointers", t);
        this.p++;
        e = this.node("Deref", t, { target: e });
      } else return e;
    }
  }
}

function isLvalue(e) {
  return e.type === "Var" || e.type === "Index" || e.type === "Member" || e.type === "Deref";
}
function checkLvalue(e, p, t) {
  if (!isLvalue(e)) throw p.err("Can only assign to a variable, array element, field or pointer target", t);
}
