import {
  EditorState, EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, highlightSpecialChars, defaultKeymap, history, historyKeymap, indentWithTab,
  toggleComment, StreamLanguage, syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching,
  indentUnit, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, linter, lintGutter,
  setDiagnostics, forceLinting, searchKeymap, highlightSelectionMatches, tags, Compartment,
} from "../vendor/codemirror.js";
import { HARD_KEYWORDS } from "./interp/lexer.js";
import { BUILTINS, BUILTIN_DOCS, AS_ONLY_BUILTINS } from "./interp/builtins.js";
import { check } from "./interp/index.js";

const TYPES = new Set(["INTEGER", "REAL", "STRING", "CHAR", "BOOLEAN", "DATE", "ARRAY"]);
const SOFT = new Set(["TYPE", "CLASS", "NEW", "SET", "DEFINE", "READ", "WRITE", "APPEND", "RANDOM", "IN", "PRINT", "ENDFOR"]);
const OPENERS = new Set(["IF", "CASE", "FOR", "WHILE", "REPEAT", "PROCEDURE", "FUNCTION", "TYPE", "CLASS"]);
const CLOSERS = new Set(["ENDIF", "ENDCASE", "NEXT", "ENDFOR", "ENDWHILE", "UNTIL", "ENDPROCEDURE", "ENDFUNCTION", "ENDTYPE", "ENDCLASS"]);
const DEDENT_START = /^\s*(ENDIF|ENDCASE|NEXT|ENDFOR|ENDWHILE|UNTIL|ENDPROCEDURE|ENDFUNCTION|ENDTYPE|ENDCLASS|ELSE|ELSEIF|OTHERWISE)\b/i;

const pseudoParser = {
  name: "pseudocode",
  startState: () => ({ depth: 0, typeLine: false, lastWord: "", lineStart: true, classDepth: [] }),
  copyState: (s) => ({ ...s, classDepth: s.classDepth.slice() }),
  token(stream, state) {
    if (stream.sol()) { state.typeLine = false; state.lastWord = ""; state.first = ""; }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^["“”][^"“”]*["“”]?/)) return "string";
    if (stream.match(/^['‘’][^'‘’]*['‘’]?/)) return "string";
    if (stream.match(/^\d+(\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const w = stream.current().toUpperCase();
      const prev = state.lastWord;
      state.lastWord = w;
      if (!state.first) state.first = w;
      if (OPENERS.has(w)) {
        // "ELSE IF" continues the same IF; "TYPE X = ..." is a one-liner; OPENFILE ... FOR is not a loop.
        if (!(w === "IF" && prev === "ELSE") && !(w === "FOR" && state.first === "OPENFILE")) state.depth++;
        if (w === "TYPE") state.typeLine = true;
      } else if (CLOSERS.has(w)) {
        state.depth = Math.max(0, state.depth - 1);
      }
      if (w === "TRUE" || w === "FALSE") return "atom";
      if (TYPES.has(w)) return "type";
      if (HARD_KEYWORDS.has(w) || (SOFT.has(w) && /^[A-Z]+$/.test(stream.current()))) return "keyword";
      if (BUILTINS[w] && stream.match(/^\s*\(/, false)) return "builtin";
      return "variable";
    }
    if (stream.match(/^(<-|←|<>|<=|>=|[=<>+\-*/^&≠≤≥])/)) {
      if (state.typeLine && stream.current() === "=") { state.depth = Math.max(0, state.depth - 1); state.typeLine = false; }
      return "operator";
    }
    stream.next();
    return null;
  },
  indent(state, textAfter, cx) {
    let d = state.depth;
    if (DEDENT_START.test(textAfter)) d--;
    return Math.max(0, d) * cx.unit;
  },
  languageData: {
    commentTokens: { line: "//" },
    indentOnInput: /^\s*(ENDIF|ENDCASE|NEXT|ENDFOR|ENDWHILE|UNTIL|ENDPROCEDURE|ENDFUNCTION|ENDTYPE|ENDCLASS|ELSE|OTHERWISE)$/i,
    closeBrackets: { brackets: ["(", "[", '"', "'"] },
  },
};

const pseudoLang = StreamLanguage.define(pseudoParser);

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--hl-keyword)", fontWeight: "600" },
  { tag: tags.typeName, color: "var(--hl-type)" },
  { tag: tags.string, color: "var(--hl-string)" },
  { tag: tags.number, color: "var(--hl-number)" },
  { tag: tags.atom, color: "var(--hl-number)" },
  { tag: tags.comment, color: "var(--hl-comment)", fontStyle: "italic" },
  { tag: tags.standard(tags.variableName), color: "var(--hl-builtin)" },
  { tag: tags.operator, color: "var(--hl-op)" },
]);

const KEYWORD_DOCS = {
  DECLARE: "DECLARE Name : TYPE", CONSTANT: "CONSTANT Name = value", INPUT: "INPUT variable", OUTPUT: "OUTPUT value, ...",
  IF: "IF cond THEN ... ENDIF", THEN: "", ELSE: "", ENDIF: "", CASE: "CASE OF var ... ENDCASE", OF: "", OTHERWISE: "",
  ENDCASE: "", FOR: "FOR i <- a TO b ... NEXT i", TO: "", STEP: "", NEXT: "", WHILE: "WHILE cond DO ... ENDWHILE",
  DO: "", ENDWHILE: "", REPEAT: "REPEAT ... UNTIL cond", UNTIL: "", PROCEDURE: "PROCEDURE Name(p : TYPE)",
  ENDPROCEDURE: "", FUNCTION: "FUNCTION Name(p : TYPE) RETURNS TYPE", ENDFUNCTION: "", RETURNS: "", RETURN: "",
  CALL: "CALL Name(args)", AND: "", OR: "", NOT: "", DIV: "", MOD: "", TRUE: "", FALSE: "", ARRAY: "ARRAY[1:n] OF TYPE",
  OPENFILE: 'OPENFILE "f.txt" FOR READ', READFILE: 'READFILE "f.txt", var', WRITEFILE: 'WRITEFILE "f.txt", value',
  CLOSEFILE: 'CLOSEFILE "f.txt"', READ: "", WRITE: "", APPEND: "",
  INTEGER: "", REAL: "", CHAR: "", STRING: "", BOOLEAN: "",
};
const AS_KEYWORD_DOCS = {
  DATE: "", TYPE: "TYPE Name ... ENDTYPE", ENDTYPE: "", CLASS: "CLASS Name ... ENDCLASS", ENDCLASS: "",
  INHERITS: "", PUBLIC: "", PRIVATE: "", NEW: "NEW ClassName(args)", SUPER: "SUPER.NEW(args)", BYREF: "", BYVAL: "",
  RANDOM: "", SEEK: 'SEEK "f.dat", address', GETRECORD: 'GETRECORD "f.dat", var', PUTRECORD: 'PUTRECORD "f.dat", var',
  DEFINE: "DEFINE Name (values) : SetType", SET: "", IN: "",
};

function completions(getMode) {
  return (ctx) => {
    const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    // Don't complete inside strings or comments.
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    if (before.includes("//") || (before.split('"').length - 1) % 2 === 1) return null;
    const as = getMode() === "as";
    const options = [];
    const seen = new Set();
    const add = (o) => { if (!seen.has(o.label.toUpperCase())) { seen.add(o.label.toUpperCase()); options.push(o); } };
    for (const [k, d] of Object.entries(KEYWORD_DOCS)) add({ label: k, type: "keyword", detail: d, boost: d ? 1 : 0 });
    if (as) for (const [k, d] of Object.entries(AS_KEYWORD_DOCS)) add({ label: k, type: "keyword", detail: d });
    for (const [k, [sig, info]] of Object.entries(BUILTIN_DOCS)) {
      if (!as && AS_ONLY_BUILTINS.has(k)) continue;
      add({ label: k, type: "function", detail: sig.replace(/^\w+/, ""), info, apply: k + "(" });
    }
    // Identifiers already in the document.
    const text = ctx.state.doc.toString();
    const re = /[A-Za-z_][A-Za-z0-9_]{1,}/g;
    let m;
    const cur = text.slice(word.from, word.to);
    while ((m = re.exec(text))) {
      const w = m[0];
      if (w === cur) continue;
      const up = w.toUpperCase();
      if (KEYWORD_DOCS[up] !== undefined || AS_KEYWORD_DOCS[up] !== undefined || BUILTINS[up]) continue;
      add({ label: w, type: "variable" });
    }
    return { from: word.from, options, validFor: /^[A-Za-z0-9_]*$/ };
  };
}

function toDiagnostic(doc, err, severity = "error") {
  if (!err.line || err.line < 1 || err.line > doc.lines) {
    return { from: 0, to: Math.min(doc.length, 1), severity, message: err.message };
  }
  const line = doc.line(err.line);
  let from = line.from, to = line.to;
  if (err.col != null) {
    from = Math.min(line.from + err.col, line.to);
    to = Math.min(line.from + (err.endCol ?? err.col + 1), line.to);
    if (to <= from) { from = line.from + (line.text.length - line.text.trimStart().length); to = line.to; }
  } else {
    from = line.from + (line.text.length - line.text.trimStart().length);
  }
  if (from === to && line.to > line.from) { from = line.from; to = line.to; }
  return { from, to, severity, message: err.message };
}

// Creates the editor. opts: { parent, getMode, onRun, onChange(path, text), onSave }
export function createEditor(opts) {
  const states = new Map(); // path -> EditorState
  let currentPath = null;
  const readOnly = new Compartment();

  const runKeys = keymap.of([
    { key: "Mod-Enter", run: () => { opts.onRun(); return true; }, preventDefault: true },
    { key: "Shift-Enter", run: () => false },
    { key: "Mod-s", run: () => { opts.onSave?.(); return true; }, preventDefault: true },
    { key: "Mod-/", run: toggleComment },
  ]);

  const common = [
    runKeys,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
    EditorView.lineWrapping,
    readOnly.of(EditorState.readOnly.of(false)),
  ];

  // Autocomplete and lint are in every state (they schedule timers that would
  // fail if a later state lacked them); they just do nothing for non-program files.
  let currentIsCode = false;
  const complete = completions(opts.getMode);
  const tools = [
    autocompletion({ override: [(ctx) => (currentIsCode ? complete(ctx) : null)], icons: false, activateOnTyping: true }),
    lintGutter(),
    linter((view) => {
      if (!currentIsCode) return [];
      const err = check(view.state.doc.toString(), opts.getMode());
      return err ? [toDiagnostic(view.state.doc, err)] : [];
    }, { delay: 350 }),
  ];

  const codeExt = [pseudoLang, syntaxHighlighting(highlight), indentOnInput()];

  const listener = EditorView.updateListener.of((u) => {
    if (u.docChanged && currentPath) opts.onChange(currentPath, u.state.doc.toString());
  });

  function makeState(content, isCode) {
    return EditorState.create({ doc: content, extensions: [common, tools, isCode ? codeExt : [], listener] });
  }

  const view = new EditorView({ parent: opts.parent, state: makeState("", false) });
  view.dom.hidden = true;

  return {
    view,
    get path() { return currentPath; },
    open(path, content, isCode) {
      if (currentPath && currentPath !== path) states.set(currentPath, view.state);
      let st = states.get(path);
      if (!st) { st = makeState(content, isCode); states.set(path, st); }
      currentPath = path;
      currentIsCode = isCode;
      view.setState(st);
      view.dom.hidden = false;
    },
    close(path) {
      states.delete(path);
      if (currentPath === path) {
        currentPath = null;
        currentIsCode = false;
        view.setState(makeState("", false));
        view.dom.hidden = true;
      }
    },
    rename(oldPath, newPath) {
      if (currentPath === oldPath) currentPath = newPath;
      if (states.has(oldPath)) { states.set(newPath, states.get(oldPath)); states.delete(oldPath); }
    },
    // Replace a file's text from outside (e.g. WRITEFILE during a run).
    setContent(path, content) {
      if (path === currentPath) {
        if (view.state.doc.toString() !== content) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
        }
      } else states.delete(path);
    },
    insert(text) {
      if (!currentPath) return;
      const { from, to } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);
      const indent = /^\s*/.exec(line.text)[0];
      const atLineStart = line.text.slice(0, from - line.from).trim() === "";
      let ins = text.replace(/\n/g, "\n" + indent);
      if (!atLineStart) ins = "\n" + indent + ins;
      view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length } });
      view.focus();
    },
    showError(err) {
      if (!currentPath) return;
      const d = toDiagnostic(view.state.doc, err);
      view.dispatch(setDiagnostics(view.state, [d]));
      view.dispatch({ selection: { anchor: d.from }, effects: EditorView.scrollIntoView(d.from, { y: "center" }) });
    },
    goTo(line) {
      if (!currentPath || line < 1 || line > view.state.doc.lines) return;
      const l = view.state.doc.line(line);
      view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
      view.focus();
    },
    relint() { if (currentPath && currentIsCode) forceLinting(view); },
    focus() { view.focus(); },
  };
}
