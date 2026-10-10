// Files created in a new workspace. mode: syllabus each program targets.
export const EXAMPLES = [
  {
    path: "main.pseudo",
    mode: "igcse",
    content: `// Press Run (Ctrl+Enter). Examples are in the examples folder.
DECLARE Name : STRING
INPUT "What is your name? ", Name
OUTPUT "Hello, ", Name
`,
  },
  {
    path: "examples/igcse/1 totals and averages.pseudo",
    mode: "igcse",
    content: `// Totalling, counting, finding the largest and smallest
DECLARE Marks : ARRAY[1:8] OF INTEGER
DECLARE Total, Highest, Lowest, Count, Index : INTEGER
DECLARE Average : REAL

Marks[1] <- 56
Marks[2] <- 72
Marks[3] <- 38
Marks[4] <- 91
Marks[5] <- 65
Marks[6] <- 47
Marks[7] <- 80
Marks[8] <- 59

Total <- 0
Count <- 0
Highest <- Marks[1]
Lowest <- Marks[1]

FOR Index <- 1 TO 8
    Total <- Total + Marks[Index]
    IF Marks[Index] >= 60
      THEN
        Count <- Count + 1
    ENDIF
    IF Marks[Index] > Highest
      THEN
        Highest <- Marks[Index]
    ENDIF
    IF Marks[Index] < Lowest
      THEN
        Lowest <- Marks[Index]
    ENDIF
NEXT Index

Average <- Total / 8
OUTPUT "Total: ", Total
OUTPUT "Average: ", ROUND(Average, 2)
OUTPUT "Highest: ", Highest, "  Lowest: ", Lowest
OUTPUT Count, " marks are 60 or more"
`,
  },
  {
    path: "examples/igcse/2 validation.pseudo",
    mode: "igcse",
    content: `// Range check with REPEAT, then a CASE statement
DECLARE Choice : INTEGER

REPEAT
    OUTPUT "1. Add   2. Subtract   3. Quit"
    INPUT "Choose 1-3: ", Choice
    IF Choice < 1 OR Choice > 3
      THEN
        OUTPUT "Invalid choice, try again"
    ENDIF
UNTIL Choice >= 1 AND Choice <= 3

CASE OF Choice
    1 : OUTPUT "You chose Add"
    2 : OUTPUT "You chose Subtract"
    OTHERWISE : OUTPUT "Goodbye"
ENDCASE
`,
  },
  {
    path: "examples/igcse/3 bubble sort.pseudo",
    mode: "igcse",
    content: `// Bubble sort with an early exit when no swaps are made
DECLARE Numbers : ARRAY[1:10] OF INTEGER
DECLARE Index, Temp, Last : INTEGER
DECLARE Swapped : BOOLEAN

FOR Index <- 1 TO 10
    Numbers[Index] <- INT(RANDOM() * 100) + 1
NEXT Index

Last <- 9
REPEAT
    Swapped <- FALSE
    FOR Index <- 1 TO Last
        IF Numbers[Index] > Numbers[Index + 1]
          THEN
            Temp <- Numbers[Index]
            Numbers[Index] <- Numbers[Index + 1]
            Numbers[Index + 1] <- Temp
            Swapped <- TRUE
        ENDIF
    NEXT Index
    Last <- Last - 1
UNTIL NOT Swapped OR Last = 0

FOR Index <- 1 TO 10
    OUTPUT Numbers[Index]
NEXT Index
`,
  },
  {
    path: "examples/igcse/4 linear search.pseudo",
    mode: "igcse",
    content: `// Linear search through an array of names
DECLARE Names : ARRAY[1:6] OF STRING
DECLARE Target : STRING
DECLARE Index : INTEGER
DECLARE Found : BOOLEAN

Names[1] <- "Amira"
Names[2] <- "Ben"
Names[3] <- "Chen"
Names[4] <- "Dara"
Names[5] <- "Eve"
Names[6] <- "Farid"

INPUT "Name to find: ", Target
Found <- FALSE
Index <- 1
WHILE Index <= 6 AND NOT Found DO
    IF UCASE(Names[Index]) = UCASE(Target)
      THEN
        Found <- TRUE
      ELSE
        Index <- Index + 1
    ENDIF
ENDWHILE

IF Found
  THEN
    OUTPUT Target, " found at position ", Index
  ELSE
    OUTPUT Target, " not found"
ENDIF
`,
  },
  {
    path: "examples/igcse/5 procedures and functions.pseudo",
    mode: "igcse",
    content: `// Procedures, functions and string handling
PROCEDURE ShowLine(Length : INTEGER)
    DECLARE Count : INTEGER
    DECLARE Line : STRING
    Line <- ""
    FOR Count <- 1 TO Length
        Line <- Line & "-"
    NEXT Count
    OUTPUT Line
ENDPROCEDURE

FUNCTION CountVowels(Text : STRING) RETURNS INTEGER
    DECLARE Index, Total : INTEGER
    DECLARE Letter : STRING
    Total <- 0
    FOR Index <- 1 TO LENGTH(Text)
        Letter <- LCASE(SUBSTRING(Text, Index, 1))
        IF Letter = "a" OR Letter = "e" OR Letter = "i" OR Letter = "o" OR Letter = "u"
          THEN
            Total <- Total + 1
        ENDIF
    NEXT Index
    RETURN Total
ENDFUNCTION

DECLARE Sentence : STRING
Sentence <- "Cambridge Computer Science"
CALL ShowLine(LENGTH(Sentence))
OUTPUT Sentence
CALL ShowLine(LENGTH(Sentence))
OUTPUT "Vowels: ", CountVowels(Sentence)
OUTPUT "First word: ", SUBSTRING(Sentence, 1, 9)
`,
  },
  {
    path: "examples/igcse/6 files.pseudo",
    mode: "igcse",
    content: `// Reads scores.txt (in this folder) and writes report.txt
DECLARE Line : STRING
DECLARE Total, Count : INTEGER

Total <- 0
Count <- 0
OPENFILE "scores.txt" FOR READ
OPENFILE "report.txt" FOR WRITE
WHILE NOT EOF("scores.txt")
    READFILE "scores.txt", Line
    Total <- Total + STRING_TO_NUM(Line)
    Count <- Count + 1
    WRITEFILE "report.txt", "Score " & NUM_TO_STRING(Count) & ": " & Line
ENDWHILE
WRITEFILE "report.txt", "Average: " & NUM_TO_STRING(Total / Count)
CLOSEFILE "scores.txt"
CLOSEFILE "report.txt"
OUTPUT "Read ", Count, " scores. Open report.txt to see the result."
`,
  },
  {
    path: "examples/igcse/scores.txt",
    content: "45\n78\n62\n90\n55\n",
  },
  {
    path: "examples/igcse/7 2D arrays.pseudo",
    mode: "igcse",
    content: `// Times table stored in a 2D array
DECLARE Table : ARRAY[1:5, 1:5] OF INTEGER
DECLARE Row, Col : INTEGER
DECLARE Line : STRING

FOR Row <- 1 TO 5
    FOR Col <- 1 TO 5
        Table[Row, Col] <- Row * Col
    NEXT Col
NEXT Row

FOR Row <- 1 TO 5
    Line <- ""
    FOR Col <- 1 TO 5
        Line <- Line & NUM_TO_STRING(Table[Row, Col]) & "  "
    NEXT Col
    OUTPUT Line
NEXT Row
`,
  },
  {
    path: "examples/as-level/1 records.pseudo",
    mode: "as",
    content: `// Records (user-defined composite type) in an array
TYPE Student
    DECLARE Name : STRING
    DECLARE Mark : INTEGER
ENDTYPE

DECLARE Class : ARRAY[1:3] OF Student
DECLARE Best : Student
DECLARE I : INTEGER

Class[1].Name <- "Ana"
Class[1].Mark <- 71
Class[2].Name <- "Bilal"
Class[2].Mark <- 88
Class[3].Name <- "Cara"
Class[3].Mark <- 64

Best <- Class[1]
FOR I <- 2 TO 3
    IF Class[I].Mark > Best.Mark THEN
        Best <- Class[I]
    ENDIF
NEXT I
OUTPUT "Top student: ", Best.Name, " (", Best.Mark, ")"
`,
  },
  {
    path: "examples/as-level/2 byref.pseudo",
    mode: "as",
    content: `// BYREF changes the caller's variable, BYVAL works on a copy
PROCEDURE Swap(BYREF A : INTEGER, B : INTEGER)
    DECLARE Temp : INTEGER
    Temp <- A
    A <- B
    B <- Temp
ENDPROCEDURE

PROCEDURE Double(BYVAL N : INTEGER)
    N <- N * 2
    OUTPUT "Inside Double: ", N
ENDPROCEDURE

DECLARE X, Y : INTEGER
X <- 3
Y <- 8
CALL Swap(X, Y)
OUTPUT "After Swap: X = ", X, ", Y = ", Y
CALL Double(X)
OUTPUT "After Double: X = ", X
`,
  },
  {
    path: "examples/as-level/3 classes.pseudo",
    mode: "as",
    content: `// Classes, inheritance, SUPER and polymorphism
CLASS Shape
    PRIVATE Name : STRING
    PUBLIC PROCEDURE NEW(GivenName : STRING)
        Name <- GivenName
    ENDPROCEDURE
    PUBLIC FUNCTION GetName() RETURNS STRING
        RETURN Name
    ENDFUNCTION
    PUBLIC FUNCTION Area() RETURNS REAL
        RETURN 0
    ENDFUNCTION
ENDCLASS

CLASS Rectangle INHERITS Shape
    PRIVATE Width : REAL
    PRIVATE Height : REAL
    PUBLIC PROCEDURE NEW(W : REAL, H : REAL)
        SUPER.NEW("Rectangle")
        Width <- W
        Height <- H
    ENDPROCEDURE
    PUBLIC FUNCTION Area() RETURNS REAL
        RETURN Width * Height
    ENDFUNCTION
ENDCLASS

CLASS Circle INHERITS Shape
    PRIVATE Radius : REAL
    PUBLIC PROCEDURE NEW(R : REAL)
        SUPER.NEW("Circle")
        Radius <- R
    ENDPROCEDURE
    PUBLIC FUNCTION Area() RETURNS REAL
        RETURN 3.14159 * Radius ^ 2
    ENDFUNCTION
ENDCLASS

DECLARE Shapes : ARRAY[1:3] OF Shape
DECLARE I : INTEGER
Shapes[1] <- NEW Rectangle(3, 4)
Shapes[2] <- NEW Circle(2)
Shapes[3] <- NEW Rectangle(1.5, 2)

FOR I <- 1 TO 3
    OUTPUT Shapes[I].GetName(), " area = ", ROUND(Shapes[I].Area(), 2)
NEXT I
`,
  },
  {
    path: "examples/as-level/4 stack and queue.pseudo",
    mode: "as",
    content: `// Array-based stack and circular queue
CONSTANT Size = 5
DECLARE Stack : ARRAY[1:Size] OF INTEGER
DECLARE Top : INTEGER
Top <- 0

PROCEDURE Push(Item : INTEGER)
    IF Top = Size THEN
        OUTPUT "Stack full"
    ELSE
        Top <- Top + 1
        Stack[Top] <- Item
    ENDIF
ENDPROCEDURE

FUNCTION Pop() RETURNS INTEGER
    DECLARE Item : INTEGER
    IF Top = 0 THEN
        OUTPUT "Stack empty"
        RETURN -1
    ENDIF
    Item <- Stack[Top]
    Top <- Top - 1
    RETURN Item
ENDFUNCTION

DECLARE Queue : ARRAY[0:Size - 1] OF STRING
DECLARE Head, Tail, Count : INTEGER
Head <- 0
Tail <- 0
Count <- 0

PROCEDURE Enqueue(Item : STRING)
    IF Count = Size THEN
        OUTPUT "Queue full"
    ELSE
        Queue[Tail] <- Item
        Tail <- (Tail + 1) MOD Size
        Count <- Count + 1
    ENDIF
ENDPROCEDURE

FUNCTION Dequeue() RETURNS STRING
    DECLARE Item : STRING
    IF Count = 0 THEN
        RETURN ""
    ENDIF
    Item <- Queue[Head]
    Head <- (Head + 1) MOD Size
    Count <- Count - 1
    RETURN Item
ENDFUNCTION

CALL Push(10)
CALL Push(20)
CALL Push(30)
OUTPUT "Popped ", Pop(), " then ", Pop()

CALL Enqueue("A")
CALL Enqueue("B")
CALL Enqueue("C")
OUTPUT "Dequeued ", Dequeue(), " then ", Dequeue()
`,
  },
  {
    path: "examples/as-level/5 random file.pseudo",
    mode: "as",
    content: `// Random-access file of records: SEEK, PUTRECORD, GETRECORD
TYPE Product
    DECLARE Code : INTEGER
    DECLARE Description : STRING
    DECLARE Price : REAL
ENDTYPE

DECLARE Item : Product
DECLARE Address : INTEGER

OPENFILE "stock.dat" FOR RANDOM
FOR Address <- 1 TO 3
    Item.Code <- 100 + Address
    Item.Description <- "Item " & NUM_TO_STR(Address)
    Item.Price <- Address * 2.5
    SEEK "stock.dat", Address
    PUTRECORD "stock.dat", Item
NEXT Address

SEEK "stock.dat", 2
GETRECORD "stock.dat", Item
CLOSEFILE "stock.dat"
OUTPUT "Record 2: ", Item.Code, " ", Item.Description, " ", Item.Price
`,
  },
  {
    path: "examples/as-level/6 enums sets pointers.pseudo",
    mode: "as",
    content: `// Enumerated types, sets and pointers
TYPE Day = (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
TYPE LetterSet = SET OF CHAR
TYPE IntPointer = ^INTEGER

DECLARE Today : Day
Today <- Wed
OUTPUT "Today is ", Today, ", tomorrow is ", Today + 1
IF Today < Sat THEN
    OUTPUT "It's a weekday"
ENDIF

DEFINE Vowels ('a', 'e', 'i', 'o', 'u') : LetterSet
OUTPUT "Is 'e' a vowel? ", 'e' IN Vowels

DECLARE Score : INTEGER
DECLARE Ptr : IntPointer
Score <- 10
Ptr <- ^Score
Ptr^ <- Ptr^ + 5
OUTPUT "Score changed through the pointer: ", Score
`,
  },
  {
    path: "examples/as-level/7 dates.pseudo",
    mode: "as",
    content: `// DATE type and date functions
DECLARE Exam : DATE
DECLARE Days : ARRAY[1:7] OF STRING
Days[1] <- "Sunday"
Days[2] <- "Monday"
Days[3] <- "Tuesday"
Days[4] <- "Wednesday"
Days[5] <- "Thursday"
Days[6] <- "Friday"
Days[7] <- "Saturday"

Exam <- SETDATE(15, 5, 2026)
OUTPUT "Exam date: ", Exam
OUTPUT "That is a ", Days[DAYINDEX(Exam)]
OUTPUT "Month ", MONTH(Exam), " of ", YEAR(Exam)
IF NOW() > Exam THEN
    OUTPUT "The exam has passed"
ELSE
    OUTPUT "The exam is coming up"
ENDIF
`,
  },
];
