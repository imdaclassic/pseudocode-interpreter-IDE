export const cases = [
  {
    name: "hello + arithmetic",
    mode: "igcse",
    src: `
DECLARE X : INTEGER
X <- 7
OUTPUT "Hello ", X
OUTPUT X DIV 2, " ", X MOD 2, " ", X / 2, " ", 2 ^ 3
OUTPUT DIV(17, 5), MOD(17, 5)
`,
    out: "Hello 7\n3 1 3.5 8\n32",
  },
  {
    name: "if / elseif / case",
    mode: "igcse",
    src: `
DECLARE Mark : INTEGER
FOR Mark <- 40 TO 90 STEP 25
  IF Mark >= 80
    THEN
      OUTPUT "A"
  ELSE IF Mark >= 60 THEN
      OUTPUT "B"
  ELSE
      OUTPUT "C"
  ENDIF
NEXT Mark
DECLARE Ch : CHAR
Ch <- 'b'
CASE OF Ch
  'a' : OUTPUT "apple"
  'b' : OUTPUT "banana"
        OUTPUT "still banana"
  OTHERWISE : OUTPUT "other"
ENDCASE
`,
    out: "C\nB\nA\nbanana\nstill banana",
  },
  {
    name: "nested IF in ELSE",
    mode: "igcse",
    src: `
X <- 5
IF X > 10 THEN
  OUTPUT "big"
ELSE
  IF X > 3 THEN
    OUTPUT "mid"
  ENDIF
ENDIF
`,
    out: "mid",
  },
  {
    name: "loops",
    mode: "igcse",
    src: `
DECLARE Total, I : INTEGER
Total <- 0
FOR I <- 10 TO 1 STEP -3
  Total <- Total + I
NEXT I
OUTPUT Total
I <- 0
WHILE I < 3 DO
  I <- I + 1
ENDWHILE
OUTPUT I
REPEAT
  I <- I - 1
UNTIL I = 0
OUTPUT I
`,
    out: "22\n3\n0",
  },
  {
    name: "arrays + bubble sort",
    mode: "igcse",
    src: `
DECLARE Nums : ARRAY[1:5] OF INTEGER
DECLARE I, J, Temp : INTEGER
Nums[1] <- 5
Nums[2] <- 3
Nums[3] <- 9
Nums[4] <- 1
Nums[5] <- 4
FOR I <- 1 TO 4
  FOR J <- 1 TO 5 - I
    IF Nums[J] > Nums[J + 1] THEN
      Temp <- Nums[J]
      Nums[J] <- Nums[J + 1]
      Nums[J + 1] <- Temp
    ENDIF
  NEXT J
NEXT I
FOR I <- 1 TO 5
  OUTPUT Nums[I]
NEXT I
`,
    out: "1\n3\n4\n5\n9",
  },
  {
    name: "2D array",
    mode: "igcse",
    src: `
DECLARE Grid : ARRAY[1:3, 1:2] OF INTEGER
DECLARE R, C : INTEGER
FOR R <- 1 TO 3
  FOR C <- 1 TO 2
    Grid[R, C] <- R * 10 + C
  NEXT C
NEXT R
OUTPUT Grid[3, 2], " ", Grid[1][1]
`,
    out: "32 11",
  },
  {
    name: "procedures and functions",
    mode: "igcse",
    src: `
PROCEDURE Greet(Name : STRING)
  OUTPUT "Hi " & Name
ENDPROCEDURE

FUNCTION Square(N : INTEGER) RETURNS INTEGER
  RETURN N * N
ENDFUNCTION

FUNCTION Fact(N : INTEGER) RETURNS INTEGER
  IF N <= 1 THEN
    RETURN 1
  ENDIF
  RETURN N * Fact(N - 1)
ENDFUNCTION

CALL Greet("Sam")
OUTPUT Square(6), " ", Fact(10)
`,
    out: "Hi Sam\n36 3628800",
  },
  {
    name: "string builtins",
    mode: "igcse",
    src: `
DECLARE S : STRING
S <- "Hello World"
OUTPUT LENGTH(S)
OUTPUT UCASE(S), " ", LCASE(S)
OUTPUT SUBSTRING(S, 7, 5)
OUTPUT ROUND(3.14159, 2), " ", INT(7.9), " ", ROUND(2.5, 0)
OUTPUT LEFT(S, 2), RIGHT(S, 3), MID(S, 2, 3)
OUTPUT ASC('A'), CHR(66)
OUTPUT NUM_TO_STR(12) & "!", STR_TO_NUM("3.5") + 1, IS_NUM("12a")
`,
    out: "11\nHELLO WORLD hello world\nWorld\n3.14 7 3\nHerldell\n65B\n12!4.5FALSE",
  },
  {
    name: "input conversion",
    mode: "igcse",
    input: ["12", "Ann"],
    src: `
DECLARE Age : INTEGER
DECLARE Name : STRING
OUTPUT "Age?"
INPUT Age
INPUT "Name: ", Name
OUTPUT Name, " will be ", Age + 1
`,
    out: "Age?\nAnn will be 13",
  },
  {
    name: "input invalid integer",
    mode: "igcse",
    input: ["abc"],
    src: `DECLARE N : INTEGER\nINPUT N`,
    error: /not a valid INTEGER/,
    errLine: 2,
  },
  {
    name: "constant",
    mode: "igcse",
    src: `CONSTANT Pi = 3.14\nOUTPUT Pi * 2`,
    out: "6.28",
  },
  {
    name: "assign to constant fails",
    mode: "igcse",
    src: `CONSTANT Max = 3\nMax <- 4`,
    error: /constant/,
    errLine: 2,
  },
  {
    name: "uninitialised variable",
    mode: "igcse",
    src: `DECLARE T : INTEGER\nT <- T + 1`,
    error: /has not been given a value/,
    errLine: 2,
  },
  {
    name: "array out of range",
    mode: "igcse",
    src: `DECLARE A : ARRAY[1:3] OF INTEGER\nA[4] <- 1`,
    error: /out of range/,
    errLine: 2,
  },
  {
    name: "real to integer compile error",
    mode: "igcse",
    src: `DECLARE X : INTEGER\nX <- 7 / 2`,
    error: /REAL value to 'X'/,
    errLine: 2,
  },
  {
    name: "string plus error",
    mode: "igcse",
    src: `DECLARE S : STRING\nS <- "a" + "b"`,
    error: /Use &/,
  },
  {
    name: "missing ENDIF",
    mode: "igcse",
    src: `IF TRUE THEN\n OUTPUT 1\n`,
    error: /missing its ENDIF/,
    errLine: 1,
  },
  {
    name: "use = for assignment",
    mode: "igcse",
    src: `DECLARE X : INTEGER\nX = 4`,
    error: /Use '<-'/,
  },
  {
    name: "igcse rejects records",
    mode: "igcse",
    src: `TYPE R\n DECLARE A : INTEGER\nENDTYPE`,
    error: /only available in AS/,
  },
  {
    name: "igcse rejects byref",
    mode: "igcse",
    src: `PROCEDURE P(BYREF X : INTEGER)\nENDPROCEDURE`,
    error: /only available in AS/,
  },
  {
    name: "igcse rejects case range",
    mode: "igcse",
    src: `X <- 3\nCASE OF X\n 1 TO 5 : OUTPUT "a"\nENDCASE`,
    error: /only available in AS/,
  },
  {
    name: "byref swap",
    src: `
PROCEDURE Swap(BYREF A : INTEGER, B : INTEGER)
  DECLARE T : INTEGER
  T <- A
  A <- B
  B <- T
ENDPROCEDURE
DECLARE X, Y : INTEGER
X <- 1
Y <- 2
CALL Swap(X, Y)
OUTPUT X, Y
DECLARE Arr : ARRAY[1:2] OF INTEGER
Arr[1] <- 5
Arr[2] <- 6
CALL Swap(Arr[1], Arr[2])
OUTPUT Arr[1], Arr[2]
`,
    out: "21\n65",
  },
  {
    name: "byval does not change",
    src: `
PROCEDURE Inc(BYVAL N : INTEGER)
  N <- N + 1
ENDPROCEDURE
X <- 1
CALL Inc(X)
OUTPUT X
`,
    out: "1",
  },
  {
    name: "array param byval copy",
    src: `
PROCEDURE Fill(A : ARRAY OF INTEGER)
  A[1] <- 99
  OUTPUT A[1]
ENDPROCEDURE
DECLARE L : ARRAY[1:2] OF INTEGER
L[1] <- 1
L[2] <- 2
CALL Fill(L)
OUTPUT L[1]
`,
    out: "99\n1",
  },
  {
    name: "records",
    src: `
TYPE Student
  DECLARE Name : STRING
  DECLARE Score : INTEGER
ENDTYPE
DECLARE A, B : Student
DECLARE Class : ARRAY[1:2] OF Student
A.Name <- "Ali"
A.Score <- 80
B <- A
B.Score <- 10
OUTPUT A.Score, " ", B.Score, " ", B.Name
Class[2].Name <- "Zoe"
OUTPUT Class[2].Name
`,
    out: "80 10 Ali\nZoe",
  },
  {
    name: "enums",
    src: `
TYPE Season = (Spring, Summer, Autumn, Winter)
DECLARE S : Season
S <- Summer
OUTPUT S
S <- S + 1
OUTPUT S, " ", S > Spring
`,
    out: "Summer\nAutumn TRUE",
  },
  {
    name: "pointers",
    src: `
TYPE IntPtr = ^INTEGER
DECLARE P : IntPtr
DECLARE N : INTEGER
N <- 5
P <- ^N
P^ <- P^ + 10
OUTPUT N, " ", P^ * 2
`,
    out: "15 30",
  },
  {
    name: "sets",
    src: `
TYPE LetterSet = SET OF CHAR
DEFINE Vowels ('a', 'e', 'i', 'o', 'u') : LetterSet
OUTPUT 'e' IN Vowels, " ", 'z' IN Vowels
`,
    out: "TRUE FALSE",
  },
  {
    name: "case ranges",
    src: `
DECLARE M : INTEGER
M <- 85
CASE OF M
  80 TO 100 : OUTPUT "A"
  60 TO 79 : OUTPUT "B"
  OTHERWISE OUTPUT "C"
ENDCASE
`,
    out: "A",
  },
  {
    name: "classes",
    src: `
CLASS Counter
  PRIVATE Value : INTEGER
  PUBLIC PROCEDURE NEW(Start : INTEGER)
    Value <- Start
  ENDPROCEDURE
  PUBLIC PROCEDURE Set(N : INTEGER)
    Value <- N
  ENDPROCEDURE
  PUBLIC FUNCTION Get() RETURNS INTEGER
    RETURN Value
  ENDFUNCTION
ENDCLASS

DECLARE A : Counter
A <- NEW Counter(1)
B <- A
CALL B.Set(9)
OUTPUT A.Get()
`,
    out: "9",
  },
  {
    name: "inheritance + super",
    src: `
CLASS Pet
  PRIVATE Name : STRING
  PUBLIC PROCEDURE NEW(GivenName : STRING)
    Name <- GivenName
  ENDPROCEDURE
  PUBLIC FUNCTION GetName() RETURNS STRING
    RETURN Name
  ENDFUNCTION
  PUBLIC FUNCTION Speak() RETURNS STRING
    RETURN "..."
  ENDFUNCTION
ENDCLASS

CLASS Cat INHERITS Pet
  PRIVATE Breed : STRING
  PUBLIC PROCEDURE NEW(GivenName : STRING, GivenBreed : STRING)
    SUPER.NEW(GivenName)
    Breed <- GivenBreed
  ENDPROCEDURE
  PUBLIC FUNCTION Speak() RETURNS STRING
    RETURN GetName() & " says meow (" & Breed & ")"
  ENDFUNCTION
ENDCLASS

DECLARE MyCat : Cat
DECLARE P : Pet
MyCat <- NEW Cat("Kitty", "Siamese")
P <- MyCat
OUTPUT P.Speak()
OUTPUT MyCat.GetName()
`,
    out: "Kitty says meow (Siamese)\nKitty",
  },
  {
    name: "private access error",
    src: `
CLASS Box
  PRIVATE Size : INTEGER
ENDCLASS
DECLARE B : Box
B <- NEW Box()
B.Size <- 3
`,
    error: /PRIVATE/,
    errLine: 7,
  },
  {
    name: "private in subclass compile error",
    src: `
CLASS A
  PRIVATE X : INTEGER
ENDCLASS
CLASS B INHERITS A
  PUBLIC PROCEDURE Foo()
    X <- 1
  ENDPROCEDURE
ENDCLASS
`,
    error: /PRIVATE in class A/,
  },
  {
    name: "sequential files",
    files: { "in.txt": "alpha\nbeta\n" },
    src: `
DECLARE Line : STRING
OPENFILE "in.txt" FOR READ
OPENFILE "out.txt" FOR WRITE
WHILE NOT EOF("in.txt")
  READFILE "in.txt", Line
  WRITEFILE "out.txt", UCASE(Line)
ENDWHILE
CLOSEFILE "in.txt"
CLOSEFILE "out.txt"
OPENFILE "out.txt" FOR APPEND
WRITEFILE "out.txt", "gamma"
CLOSEFILE "out.txt"
OUTPUT "done"
`,
    out: "done",
    files_after: { "out.txt": "ALPHA\nBETA\ngamma\n" },
  },
  {
    name: "file not found",
    src: `OPENFILE "nope.txt" FOR READ`,
    error: /not found/,
  },
  {
    name: "random files",
    src: `
TYPE Item
  DECLARE Code : INTEGER
  DECLARE Desc : STRING
ENDTYPE
DECLARE It, Back : Item
OPENFILE "stock.dat" FOR RANDOM
It.Code <- 7
It.Desc <- "Pen"
SEEK "stock.dat", 3
PUTRECORD "stock.dat", It
SEEK "stock.dat", 3
GETRECORD "stock.dat", Back
CLOSEFILE "stock.dat"
OUTPUT Back.Code, Back.Desc
`,
    out: "7Pen",
  },
  {
    name: "dates",
    src: `
DECLARE D : DATE
D <- SETDATE(25, 12, 2024)
OUTPUT D, " ", DAY(D), " ", MONTH(D), " ", YEAR(D), " ", DAYINDEX(D)
OUTPUT D > SETDATE(1, 1, 2024)
`,
    out: "25/12/2024 25 12 2024 4\nTRUE",
  },
  {
    name: "function result type check",
    src: `
FUNCTION F() RETURNS INTEGER
  RETURN 2.5
ENDFUNCTION
OUTPUT F()
`,
    error: /RETURNS INTEGER/,
  },
  {
    name: "call function with CALL error",
    src: `
FUNCTION F() RETURNS INTEGER
  RETURN 1
ENDFUNCTION
CALL F()
`,
    error: /FUNCTION/,
  },
  {
    name: "recursion depth",
    src: `
FUNCTION F(N : INTEGER) RETURNS INTEGER
  RETURN F(N + 1)
ENDFUNCTION
OUTPUT F(1)
`,
    error: /recursion/,
  },
  {
    name: "soft keywords as names",
    src: `
DECLARE Type : INTEGER
DECLARE Set : STRING
Type <- 3
Set <- "x"
OUTPUT Type, Set
`,
    out: "3x",
  },
  {
    name: "case-insensitive identifiers & keywords",
    mode: "igcse",
    src: `
declare count : integer
Count <- 2
output COUNT
`,
    out: "2",
  },
  {
    name: "linear search with boolean flag",
    mode: "igcse",
    src: `
DECLARE Names : ARRAY[1:4] OF STRING
DECLARE Found : BOOLEAN
DECLARE I : INTEGER
Names[1] <- "Ann"
Names[2] <- "Bob"
Names[3] <- "Cat"
Names[4] <- "Dan"
Found <- FALSE
I <- 1
WHILE I <= 4 AND NOT Found
  IF Names[I] = "Cat" THEN
    Found <- TRUE
  ELSE
    I <- I + 1
  ENDIF
ENDWHILE
IF Found THEN OUTPUT "Found at ", I ENDIF
`,
    error: /own line/,
  },
  {
    name: "linear search proper",
    mode: "igcse",
    src: `
DECLARE Names : ARRAY[1:4] OF STRING
DECLARE Found : BOOLEAN
DECLARE I : INTEGER
Names[1] <- "Ann"
Names[2] <- "Bob"
Names[3] <- "Cat"
Names[4] <- "Dan"
Found <- FALSE
I <- 1
WHILE I <= 4 AND NOT Found
  IF Names[I] = "Cat"
    THEN
      Found <- TRUE
    ELSE
      I <- I + 1
  ENDIF
ENDWHILE
IF Found THEN
  OUTPUT "Found at ", I
ENDIF
`,
    out: "Found at 3",
  },
  {
    name: "compare int with string",
    mode: "igcse",
    src: `DECLARE X : INTEGER\nX <- 3\nIF X = "3" THEN\nOUTPUT 1\nENDIF`,
    error: /Cannot compare/,
  },
  {
    name: "real formatting",
    mode: "igcse",
    src: `OUTPUT 0.1 + 0.2, " ", 10 / 4, " ", 1 / 3`,
    out: "0.3 2.5 0.333333333333",
  },
  {
    name: "undeclared variable read",
    mode: "igcse",
    src: `OUTPUT Foo`,
    error: /has not been declared/,
  },
  {
    name: "for loop variable implicit",
    mode: "igcse",
    src: `FOR i <- 1 TO 3\nOUTPUT i\nNEXT i`,
    out: "1\n2\n3",
  },
  {
    name: "procedure without params & no parens",
    mode: "igcse",
    src: `PROCEDURE Line\nOUTPUT "----"\nENDPROCEDURE\nCALL Line\nCALL Line()`,
    out: "----\n----",
  },
  {
    name: "global modified in procedure",
    mode: "igcse",
    src: `DECLARE Total : INTEGER\nTotal <- 0\nPROCEDURE Add(N : INTEGER)\n  Total <- Total + N\nENDPROCEDURE\nCALL Add(5)\nCALL Add(6)\nOUTPUT Total`,
    out: "11",
  },
  {
    name: "pointer to record",
    src: `
TYPE Node
  DECLARE Val : INTEGER
ENDTYPE
TYPE NodePtr = ^Node
DECLARE N : Node
DECLARE P : NodePtr
P <- ^N
P^.Val <- 42
OUTPUT N.Val
`,
    out: "42",
  },
  {
    name: "CASE with string subject and multiple values",
    mode: "igcse",
    src: `
Cmd <- "stop"
CASE OF Cmd
  "go" : OUTPUT "going"
  "stop", "halt" : OUTPUT "stopping"
ENDCASE
`,
    out: "stopping",
  },
  {
    name: "power vs expression",
    src: `OUTPUT 2^-1, " ", -2 ^ 2, " ", (1 + 2) ^ 2`,
    out: "0.5 -4 9",
  },
];
