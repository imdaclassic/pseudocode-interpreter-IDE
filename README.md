# Pseudocode IDE

**Live site: https://imdaclassic.github.io/pseudocode-interpreter-IDE/**

Made by [@imdaclassic](https://github.com/imdaclassic).

An IDE for Cambridge pseudocode with a built-in interpreter, running entirely in the browser. You get a file workspace, a code editor with live error checking, and a console that runs your programs. It has two modes:

- **IGCSE** (0478 / 0984 / 2210): the core language
- **AS & A Level** (9618): adds DATE, CASE ranges, BYREF/BYVAL, records, enumerations, pointers, sets, classes and inheritance, and random-access files

Programs are compiled to JavaScript and run in a Web Worker, so loops are fast and an infinite loop can be stopped. Files, including the data files used by `OPENFILE`, are stored in the browser (localStorage). **Save** downloads the whole workspace as a single `.pseudows` file, and **Load** opens it again (dragging a `.pseudows` file onto the Files panel works too).

## Run locally

Any static server works, for example:

```
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk doesn't work, because ES modules and workers need http.

## Tests

```
node tests/run.mjs        # language tests (IGCSE + AS features, error messages)
node tests/examples.mjs   # runs every bundled example program
node tests/perf.mjs       # recursion depth and loop speed
```

## Layout

| Path | What it is |
|---|---|
| `js/interp/lexer.js`, `parser.js` | Source to AST, with line and column for errors |
| `js/interp/compiler.js` | AST to async JavaScript, plus checks before the program runs (undeclared names, type mismatches, mode gating) |
| `js/interp/runtime.js` | Values, type checking, arrays, records, objects, files and built-in functions |
| `js/worker.js` | Runs the program off the main thread |
| `js/main.js` | UI: files, tabs, console, mode switch |
| `js/editor.js` | CodeMirror setup: highlighting, auto-indent, completion, live errors |
| `js/examples.js`, `js/reference.js` | Starter programs and the syntax reference panel |
