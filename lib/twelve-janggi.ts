export const TWELVE_JANGGI_COLUMNS = 3;
export const TWELVE_JANGGI_ROWS = 4;
export const TWELVE_JANGGI_CELL_COUNT = TWELVE_JANGGI_COLUMNS * TWELVE_JANGGI_ROWS;

export type TjOwner = "host" | "guest";
export type TjPieceKind = "JANG" | "SANG" | "KING" | "JA" | "HU";
export type TjHandCode = "J" | "S" | "K" | "P";
export type TjPieceCode = "HJ" | "HS" | "HK" | "HP" | "HU" | "GJ" | "GS" | "GK" | "GP" | "GU";

export type TjBoardCell = TjPieceCode | null;

export interface TjPiece {
  owner: TjOwner;
  kind: TjPieceKind;
  code: TjPieceCode;
}

const HAND_CODE_SORT_ORDER: Record<TjHandCode, number> = {
  J: 0,
  S: 1,
  P: 2,
  K: 3,
};

export const INITIAL_TJ_BOARD: TjBoardCell[] = [
  "GJ",
  "GK",
  "GS",
  null,
  "GP",
  null,
  null,
  "HP",
  null,
  "HS",
  "HK",
  "HJ",
];

export function getTjOpponent(owner: TjOwner): TjOwner {
  return owner === "host" ? "guest" : "host";
}

export function createInitialTjBoard(): TjBoardCell[] {
  return [...INITIAL_TJ_BOARD];
}

export function decodeTjPieceCode(code: string | null | undefined): TjPiece | null {
  if (!code) return null;

  const ownerPrefix = code[0];
  const kindSuffix = code.slice(1);

  const owner: TjOwner | null = ownerPrefix === "H" ? "host" : ownerPrefix === "G" ? "guest" : null;
  if (!owner) return null;

  const kind = kindSuffix === "J"
    ? "JANG"
    : kindSuffix === "S"
      ? "SANG"
      : kindSuffix === "K"
        ? "KING"
        : kindSuffix === "P"
          ? "JA"
          : kindSuffix === "U"
            ? "HU"
            : null;

  if (!kind) return null;
  return { owner, kind, code: code as TjPieceCode };
}

export function encodeTjPieceCode(owner: TjOwner, kind: TjPieceKind): TjPieceCode {
  const ownerPrefix = owner === "host" ? "H" : "G";
  const kindSuffix = kind === "JANG"
    ? "J"
    : kind === "SANG"
      ? "S"
      : kind === "KING"
        ? "K"
        : kind === "JA"
          ? "P"
          : "U";

  return `${ownerPrefix}${kindSuffix}` as TjPieceCode;
}

export function kindToTjHandCode(kind: TjPieceKind): TjHandCode {
  if (kind === "JANG") return "J";
  if (kind === "SANG") return "S";
  if (kind === "KING") return "K";
  return "P";
}

export function handCodeToTjPieceKind(code: TjHandCode): TjPieceKind {
  if (code === "J") return "JANG";
  if (code === "S") return "SANG";
  if (code === "K") return "KING";
  return "JA";
}

export function formatTjPieceKind(kind: TjPieceKind): string {
  if (kind === "JANG") return "장";
  if (kind === "SANG") return "상";
  if (kind === "KING") return "왕";
  if (kind === "HU") return "후";
  return "자";
}

export function formatTjHandCode(code: TjHandCode): string {
  return formatTjPieceKind(handCodeToTjPieceKind(code));
}

export function rowFromTjCell(cell: number): number {
  return Math.floor(cell / TWELVE_JANGGI_COLUMNS);
}

export function colFromTjCell(cell: number): number {
  return cell % TWELVE_JANGGI_COLUMNS;
}

export function cellFromTjRowCol(row: number, col: number): number {
  return row * TWELVE_JANGGI_COLUMNS + col;
}

export function isTjCellInBounds(cell: number): boolean {
  return cell >= 0 && cell < TWELVE_JANGGI_CELL_COUNT;
}

export function isTjRowColInBounds(row: number, col: number): boolean {
  return row >= 0 && row < TWELVE_JANGGI_ROWS && col >= 0 && col < TWELVE_JANGGI_COLUMNS;
}

export function isTjOwnerCamp(owner: TjOwner, cell: number): boolean {
  const row = rowFromTjCell(cell);
  return owner === "host" ? row === TWELVE_JANGGI_ROWS - 1 : row === 0;
}

export function isTjOpponentCamp(owner: TjOwner, cell: number): boolean {
  return isTjOwnerCamp(getTjOpponent(owner), cell);
}

export function normalizeTjBoard(rawBoard: unknown): TjBoardCell[] {
  if (!Array.isArray(rawBoard)) {
    return createInitialTjBoard();
  }

  const nextBoard = Array.from({ length: TWELVE_JANGGI_CELL_COUNT }, (_, index) => {
    const value = rawBoard[index];
    if (typeof value !== "string") return null;
    return decodeTjPieceCode(value)?.code ?? null;
  });

  return nextBoard;
}

export function normalizeTjHand(rawHand: unknown): TjHandCode[] {
  if (!Array.isArray(rawHand)) return [];

  return rawHand
    .map((value) => (typeof value === "string" ? value.toUpperCase() : ""))
    .filter((value): value is TjHandCode => value === "J" || value === "S" || value === "K" || value === "P")
    .sort((left, right) => HAND_CODE_SORT_ORDER[left] - HAND_CODE_SORT_ORDER[right]);
}

export function sortTjHand(hand: TjHandCode[]): TjHandCode[] {
  return [...hand].sort((left, right) => HAND_CODE_SORT_ORDER[left] - HAND_CODE_SORT_ORDER[right]);
}

export function getTjForwardStep(owner: TjOwner): number {
  return owner === "host" ? -1 : 1;
}

function getTjDirectionSet(piece: TjPiece): Array<[number, number]> {
  const forward = getTjForwardStep(piece.owner);
  const backward = -forward;

  if (piece.kind === "JANG") {
    return [
      [forward, 0],
      [backward, 0],
      [0, -1],
      [0, 1],
    ];
  }

  if (piece.kind === "SANG") {
    return [
      [forward, -1],
      [forward, 1],
      [backward, -1],
      [backward, 1],
    ];
  }

  if (piece.kind === "KING") {
    return [
      [forward, 0],
      [backward, 0],
      [0, -1],
      [0, 1],
      [forward, -1],
      [forward, 1],
      [backward, -1],
      [backward, 1],
    ];
  }

  if (piece.kind === "HU") {
    return [
      [forward, 0],
      [backward, 0],
      [0, -1],
      [0, 1],
      [forward, -1],
      [forward, 1],
    ];
  }

  return [[forward, 0]];
}

export function getTjLegalMoveTargets(board: TjBoardCell[], fromCell: number): number[] {
  if (!isTjCellInBounds(fromCell)) return [];

  const piece = decodeTjPieceCode(board[fromCell]);
  if (!piece) return [];

  const originRow = rowFromTjCell(fromCell);
  const originCol = colFromTjCell(fromCell);

  return getTjDirectionSet(piece).flatMap(([rowDelta, colDelta]) => {
    const targetRow = originRow + rowDelta;
    const targetCol = originCol + colDelta;
    if (!isTjRowColInBounds(targetRow, targetCol)) return [];

    const targetCell = cellFromTjRowCol(targetRow, targetCol);
    const targetPiece = decodeTjPieceCode(board[targetCell]);
    if (targetPiece?.owner === piece.owner) return [];
    return [targetCell];
  });
}

export function getTjLegalDropTargets(board: TjBoardCell[], owner: TjOwner): number[] {
  return Array.from({ length: TWELVE_JANGGI_CELL_COUNT }, (_, cell) => cell).filter(
    (cell) => board[cell] === null && !isTjOpponentCamp(owner, cell)
  );
}

export function canTjPlayerSelectCell(board: TjBoardCell[], owner: TjOwner, cell: number): boolean {
  return decodeTjPieceCode(board[cell])?.owner === owner;
}

export function getTjKingCell(board: TjBoardCell[], owner: TjOwner): number | null {
  for (let cell = 0; cell < board.length; cell += 1) {
    const piece = decodeTjPieceCode(board[cell]);
    if (piece?.owner === owner && piece.kind === "KING") {
      return cell;
    }
  }
  return null;
}

export function willTjPiecePromote(kind: TjPieceKind, owner: TjOwner, toCell: number): boolean {
  return kind === "JA" && isTjOpponentCamp(owner, toCell);
}

export function nextTjPieceKindAfterMove(kind: TjPieceKind, owner: TjOwner, toCell: number): TjPieceKind {
  return willTjPiecePromote(kind, owner, toCell) ? "HU" : kind;
}

export function hasTjPendingTry(board: TjBoardCell[], owner: TjOwner): boolean {
  const kingCell = getTjKingCell(board, owner);
  return kingCell !== null && isTjOpponentCamp(owner, kingCell);
}

export function toTjCanonicalCell(viewCell: number, perspective: TjOwner): number {
  return perspective === "guest" ? TWELVE_JANGGI_CELL_COUNT - 1 - viewCell : viewCell;
}

export function toTjViewCell(canonicalCell: number, perspective: TjOwner): number {
  return toTjCanonicalCell(canonicalCell, perspective);
}

export function formatTjCellLabel(cell: number): string {
  return `${rowFromTjCell(cell) + 1}행 ${colFromTjCell(cell) + 1}열`;
}
