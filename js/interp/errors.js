// Error raised for problems in the user's pseudocode (syntax or runtime).
export class PseudoError extends Error {
  constructor(message, line = null, col = null, endCol = null) {
    super(message);
    this.line = line;
    this.col = col;
    this.endCol = endCol;
  }
}
