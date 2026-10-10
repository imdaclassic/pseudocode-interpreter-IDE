import { BUILTIN_DOCS, AS_ONLY_BUILTINS } from "./interp/builtins.js";

// Each section: { title, as (AS & A Level only), text, code[] }
export const SECTIONS = [
  {
    title: "Basics",
    text: "One statement per line. Comments start with //. Keywords are written in capitals. Identifiers are not case-sensitive.",
    code: [`// This is a comment\nDECLARE Count : INTEGER\nCount <- 0`],
  },
  {
    title: "Data types",
    text: "INTEGER, REAL, CHAR ('A'), STRING (\"text\"), BOOLEAN (TRUE / FALSE). AS & A Level adds DATE.",
    code: [`DECLARE Age : INTEGER\nDECLARE Price : REAL\nDECLARE Initial : CHAR\nDECLARE Name : STRING\nDECLARE Done : BOOLEAN`],
  },
  {
    title: "Constants and assignment",
    text: "Assignment uses <- (← also works). Constants cannot be changed.",
    code: [`CONSTANT Pi = 3.142\nDECLARE Area : REAL\nArea <- Pi * 2 * 2`],
  },
  {
    title: "Input and output",
    text: "OUTPUT joins several values with no extra spaces. INPUT can show a prompt first.",
    code: [`DECLARE Name : STRING\nINPUT "Enter your name: ", Name\nOUTPUT "Hello ", Name`],
  },
  {
    title: "Operators",
    text: "Arithmetic: + - * / ^ DIV MOD. Comparison: = <> < > <= >=. Logic: AND OR NOT. Join strings with &. / always gives a REAL; DIV gives a whole number.",
    code: [`OUTPUT 17 DIV 5, " ", 17 MOD 5, " ", 17 / 5\nOUTPUT "Total: " & "10"\nOUTPUT (3 > 2) AND NOT (1 = 2)`],
  },
  {
    title: "IF",
    text: "THEN may go on the next line. ELSE IF (or ELSEIF) chains share one ENDIF.",
    code: [
      `IF Mark >= 50\n  THEN\n    OUTPUT "Pass"\n  ELSE\n    OUTPUT "Fail"\nENDIF`,
      `IF Mark >= 70 THEN\n    OUTPUT "A"\nELSE IF Mark >= 50 THEN\n    OUTPUT "B"\nELSE\n    OUTPUT "C"\nENDIF`,
    ],
  },
  {
    title: "CASE",
    text: "Compares one value against a list. OTHERWISE is optional.",
    code: [`CASE OF Choice\n    1 : OUTPUT "One"\n    2 : OUTPUT "Two"\n    OTHERWISE : OUTPUT "Other"\nENDCASE`],
  },
  {
    title: "CASE ranges",
    as: true,
    text: "A label can cover a range of values.",
    code: [`CASE OF Mark\n    80 TO 100 : OUTPUT "A"\n    60 TO 79 : OUTPUT "B"\n    OTHERWISE : OUTPUT "C"\nENDCASE`],
  },
  {
    title: "FOR loop",
    text: "Count-controlled loop. STEP is optional and can be negative.",
    code: [`FOR Count <- 1 TO 10\n    OUTPUT Count\nNEXT Count`, `FOR Count <- 10 TO 0 STEP -2\n    OUTPUT Count\nNEXT Count`],
  },
  {
    title: "WHILE loop",
    text: "Pre-condition loop: may run zero times.",
    code: [`WHILE Number > 9 DO\n    Number <- Number DIV 10\nENDWHILE`],
  },
  {
    title: "REPEAT loop",
    text: "Post-condition loop: always runs at least once.",
    code: [`REPEAT\n    INPUT "Enter 1-10: ", Number\nUNTIL Number >= 1 AND Number <= 10`],
  },
  {
    title: "Arrays",
    text: "Bounds are set when declared. Use [Row, Column] for 2D arrays.",
    code: [
      `DECLARE Scores : ARRAY[1:10] OF INTEGER\nScores[1] <- 75`,
      `DECLARE Board : ARRAY[1:3, 1:3] OF CHAR\nBoard[2, 3] <- 'X'`,
    ],
  },
  {
    title: "Procedures",
    text: "A procedure does not return a value. Call it with CALL.",
    code: [`PROCEDURE Stars(Number : INTEGER)\n    DECLARE Count : INTEGER\n    FOR Count <- 1 TO Number\n        OUTPUT "*"\n    NEXT Count\nENDPROCEDURE\n\nCALL Stars(3)`],
  },
  {
    title: "Functions",
    text: "A function returns one value and is used inside an expression.",
    code: [`FUNCTION Max(A : INTEGER, B : INTEGER) RETURNS INTEGER\n    IF A > B THEN\n        RETURN A\n    ENDIF\n    RETURN B\nENDFUNCTION\n\nOUTPUT Max(4, 9)`],
  },
  {
    title: "BYREF and BYVAL",
    as: true,
    text: "BYVAL (default) passes a copy. BYREF passes the variable itself, so changes affect the caller. The keyword applies to the parameters after it.",
    code: [`PROCEDURE Swap(BYREF X : INTEGER, Y : INTEGER)\n    DECLARE Temp : INTEGER\n    Temp <- X\n    X <- Y\n    Y <- Temp\nENDPROCEDURE`],
  },
  {
    title: "Text files",
    text: "Files live in the Files panel. Names are relative to the folder of the running program. READFILE reads one line; WRITEFILE writes one line.",
    code: [
      `OPENFILE "data.txt" FOR WRITE\nWRITEFILE "data.txt", "first line"\nCLOSEFILE "data.txt"`,
      `DECLARE Line : STRING\nOPENFILE "data.txt" FOR READ\nWHILE NOT EOF("data.txt")\n    READFILE "data.txt", Line\n    OUTPUT Line\nENDWHILE\nCLOSEFILE "data.txt"`,
      `OPENFILE "data.txt" FOR APPEND\nWRITEFILE "data.txt", "added at the end"\nCLOSEFILE "data.txt"`,
    ],
  },
  {
    title: "Records (TYPE)",
    as: true,
    text: "A composite type. Access fields with a dot. Assigning one record to another copies it.",
    code: [`TYPE Student\n    DECLARE Name : STRING\n    DECLARE Mark : INTEGER\nENDTYPE\n\nDECLARE Pupil : Student\nPupil.Name <- "Ali"\nPupil.Mark <- 82`],
  },
  {
    title: "Enumerated types",
    as: true,
    text: "Values are ordered, so they can be compared and stepped with + / -.",
    code: [`TYPE Season = (Spring, Summer, Autumn, Winter)\nDECLARE Now : Season\nNow <- Summer\nOUTPUT Now + 1`],
  },
  {
    title: "Pointers",
    as: true,
    text: "^Variable gives its address. Ptr^ reads or writes the value it points to.",
    code: [`TYPE IntPointer = ^INTEGER\nDECLARE Ptr : IntPointer\nDECLARE Value : INTEGER\nValue <- 5\nPtr <- ^Value\nPtr^ <- Ptr^ * 2\nOUTPUT Value`],
  },
  {
    title: "Sets",
    as: true,
    text: "Declare a set type, then DEFINE a set of values. Test membership with IN.",
    code: [`TYPE LetterSet = SET OF CHAR\nDEFINE Vowels ('a', 'e', 'i', 'o', 'u') : LetterSet\nOUTPUT 'a' IN Vowels`],
  },
  {
    title: "Classes and objects",
    as: true,
    text: "Attributes are usually PRIVATE; methods PUBLIC. The constructor is PROCEDURE NEW. Objects are references: B <- A makes both names refer to the same object.",
    code: [`CLASS Pet\n    PRIVATE Name : STRING\n    PUBLIC PROCEDURE NEW(GivenName : STRING)\n        Name <- GivenName\n    ENDPROCEDURE\n    PUBLIC FUNCTION GetName() RETURNS STRING\n        RETURN Name\n    ENDFUNCTION\nENDCLASS\n\nDECLARE MyPet : Pet\nMyPet <- NEW Pet("Rex")\nOUTPUT MyPet.GetName()`],
  },
  {
    title: "Inheritance",
    as: true,
    text: "A subclass INHERITS attributes and methods. SUPER calls the parent's version. Methods can be overridden.",
    code: [`CLASS Cat INHERITS Pet\n    PRIVATE Breed : STRING\n    PUBLIC PROCEDURE NEW(GivenName : STRING, GivenBreed : STRING)\n        SUPER.NEW(GivenName)\n        Breed <- GivenBreed\n    ENDPROCEDURE\nENDCLASS`],
  },
  {
    title: "Random-access files",
    as: true,
    text: "Records are stored by address (starting at 1). SEEK moves to an address before GETRECORD or PUTRECORD.",
    code: [`OPENFILE "stock.dat" FOR RANDOM\nSEEK "stock.dat", 3\nPUTRECORD "stock.dat", Item\nSEEK "stock.dat", 3\nGETRECORD "stock.dat", Item\nCLOSEFILE "stock.dat"`],
  },
  {
    title: "Dates",
    as: true,
    text: "DATE values are shown as dd/mm/yyyy and can be compared. INPUT into a DATE expects dd/mm/yyyy.",
    code: [`DECLARE Start : DATE\nStart <- SETDATE(1, 9, 2026)\nOUTPUT DAY(Start), "/", MONTH(Start), " ", DAYINDEX(Start)`],
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderReference(container, mode, query, onInsert) {
  const q = query.trim().toLowerCase();
  const isAS = mode === "as";
  const parts = [];
  SECTIONS.forEach((s, i) => {
    const hay = (s.title + " " + s.text + " " + s.code.join(" ")).toLowerCase();
    if (q && !hay.includes(q)) return;
    const locked = s.as && !isAS;
    parts.push(`<section class="${locked ? "locked" : ""}">
<h3>${esc(s.title)}${s.as ? `<span class="as-tag">AS &amp; A Level</span>` : ""}</h3>
<p>${esc(s.text)}${locked ? " Switch to AS &amp; A Level mode to use this." : ""}</p>
${s.code.map((c, j) => `<pre>${esc(c)}${locked ? "" : `<button type="button" data-ins="${i}:${j}" title="Insert at cursor">Insert</button>`}</pre>`).join("")}
</section>`);
  });
  const rows = Object.entries(BUILTIN_DOCS)
    .filter(([k, [sig, info]]) => !q || (k + sig + info).toLowerCase().includes(q))
    .map(([k, [sig, info]]) => {
      const locked = AS_ONLY_BUILTINS.has(k) && !isAS;
      return `<tr${locked ? ' style="opacity:.55"' : ""}><td>${esc(sig)}</td><td>${esc(info)}${AS_ONLY_BUILTINS.has(k) ? " (AS & A Level)" : ""}</td></tr>`;
    });
  if (rows.length) {
    parts.push(`<section><h3>Built-in functions</h3><div class="wrap-x"><table>${rows.join("")}</table></div></section>`);
  }
  if (!parts.length) parts.push(`<p>No matches for "${esc(query)}".</p>`);
  container.innerHTML = parts.join("");
  container.querySelectorAll("button[data-ins]").forEach((b) => {
    b.addEventListener("click", () => {
      const [i, j] = b.dataset.ins.split(":").map(Number);
      onInsert(SECTIONS[i].code[j]);
    });
  });
}
