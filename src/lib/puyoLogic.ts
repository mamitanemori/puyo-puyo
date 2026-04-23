import type { Board, Cell, PuyoColor, Piece } from '@/types/puyo';

export const COLS = 6;
export const ROWS = 12;
export const COLORS: PuyoColor[] = ['red', 'blue', 'green', 'yellow', 'purple'];

export function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function randomColor(): PuyoColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function randomColors(): [PuyoColor, PuyoColor] {
  return [randomColor(), randomColor()];
}

export function getSatellitePos(piece: Piece): { x: number; y: number } {
  const offsets: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const [dx, dy] = offsets[piece.rotation];
  return { x: piece.x + dx, y: piece.y + dy };
}

export function isValidPos(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= COLS || y >= ROWS) return false;
  if (y < 0) return true; // above board is allowed
  return board[y][x] === null;
}

export function isPieceValid(board: Board, piece: Piece): boolean {
  const sub = getSatellitePos(piece);
  return isValidPos(board, piece.x, piece.y) && isValidPos(board, sub.x, sub.y);
}

export function spawnPiece(mainColor: PuyoColor, subColor: PuyoColor): Piece {
  return { mainColor, subColor, x: 2, y: 0, rotation: 0 };
}

export function placePiece(board: Board, piece: Piece): Board {
  const next = board.map(row => [...row]);
  if (piece.y >= 0 && piece.y < ROWS) next[piece.y][piece.x] = piece.mainColor;
  const sub = getSatellitePos(piece);
  if (sub.y >= 0 && sub.y < ROWS) next[sub.y][sub.x] = piece.subColor;
  return next;
}

export function getGhostPiece(board: Board, piece: Piece): Piece {
  let ghost = { ...piece };
  while (true) {
    const moved = { ...ghost, y: ghost.y + 1 };
    if (!isPieceValid(board, moved)) break;
    ghost = moved;
  }
  return ghost;
}

export function findConnectedGroups(board: Board): Array<{ color: PuyoColor; cells: Array<{ x: number; y: number }> }> {
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const groups: Array<{ color: PuyoColor; cells: Array<{ x: number; y: number }> }> = [];

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!visited[y][x] && board[y][x] !== null) {
        const color = board[y][x] as PuyoColor;
        const cells: Array<{ x: number; y: number }> = [];
        const queue = [{ x, y }];
        visited[y][x] = true;
        while (queue.length) {
          const curr = queue.shift()!;
          cells.push(curr);
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = curr.x + dx, ny = curr.y + dy;
            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !visited[ny][nx] && board[ny][nx] === color) {
              visited[ny][nx] = true;
              queue.push({ x: nx, y: ny });
            }
          }
        }
        groups.push({ color, cells });
      }
    }
  }
  return groups;
}

export function findPops(board: Board): Array<{ x: number; y: number }> {
  return findConnectedGroups(board)
    .filter(g => g.cells.length >= 4)
    .flatMap(g => g.cells);
}

export function applyGravity(board: Board): Board {
  const next: Board = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
  for (let x = 0; x < COLS; x++) {
    const col: Cell[] = [];
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y][x] !== null) col.push(board[y][x]);
    }
    for (let i = 0; i < col.length; i++) {
      next[ROWS - 1 - i][x] = col[i];
    }
  }
  return next;
}

export function resolveBoard(board: Board): { board: Board; chains: number; poppedTotal: number } {
  let cur = board;
  let chains = 0;
  let poppedTotal = 0;
  while (true) {
    const pops = findPops(cur);
    if (!pops.length) break;
    const next = cur.map(row => [...row]);
    for (const { x, y } of pops) next[y][x] = null;
    cur = applyGravity(next);
    chains++;
    poppedTotal += pops.length;
  }
  return { board: cur, chains, poppedTotal };
}

export function calcScore(poppedTotal: number, chains: number, level: number): number {
  if (!poppedTotal) return 0;
  const chainBonus = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192][Math.min(chains, 9)] ?? 192;
  return poppedTotal * 10 * (chainBonus + 1) * level;
}

export function isGameOver(board: Board): boolean {
  return board[0][2] !== null; // spawn column only
}

export function dropInterval(level: number): number {
  return Math.max(80, 550 - (level - 1) * 50);
}

export function tryRotate(board: Board, piece: Piece, dir: 1 | -1): Piece {
  const rotation = ((piece.rotation + dir + 4) % 4) as 0 | 1 | 2 | 3;
  const rotated = { ...piece, rotation };
  if (isPieceValid(board, rotated)) return rotated;
  for (const dx of [-1, 1]) {
    const kicked = { ...rotated, x: rotated.x + dx };
    if (isPieceValid(board, kicked)) return kicked;
  }
  return piece;
}
