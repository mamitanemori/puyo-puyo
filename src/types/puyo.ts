export type PuyoColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';
export type Cell = PuyoColor | null;
export type Board = Cell[][];

export interface Piece {
  mainColor: PuyoColor;
  subColor: PuyoColor;
  x: number;
  y: number;
  rotation: 0 | 1 | 2 | 3; // satellite direction: 0=up, 1=right, 2=down, 3=left
}

export type GamePhase = 'idle' | 'falling' | 'popping' | 'gameover';

export interface GameState {
  board: Board;
  currentPiece: Piece | null;
  nextColors: [PuyoColor, PuyoColor];
  score: number;
  level: number;
  chain: number;
  maxChain: number;
  phase: GamePhase;
  totalPopped: number;
  poppingCells: Array<{ x: number; y: number }>;
  popGen: number;   // increments each time a new pop set starts — used as effect dependency
  paused: boolean;
}
