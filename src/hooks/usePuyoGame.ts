'use client';
import { useReducer, useEffect, useCallback } from 'react';
import type { GameState, Piece } from '@/types/puyo';
import {
  createEmptyBoard, randomColors, spawnPiece, placePiece,
  isPieceValid, findPops, applyGravity, calcScore, isGameOver,
  dropInterval, tryRotate,
} from '@/lib/puyoLogic';
import { sfx, enableSounds } from '@/lib/sounds';

export const POP_ANIM_MS = 420;

type Action =
  | { type: 'START' | 'RESTART' | 'TICK' | 'SOFT_DROP' | 'HARD_DROP' | 'EXECUTE_POP' | 'TOGGLE_PAUSE' }
  | { type: 'MOVE'; dx: number }
  | { type: 'ROTATE'; dir: 1 | -1 };

function getInitialState(): GameState {
  return {
    board: createEmptyBoard(),
    currentPiece: null,
    nextColors: randomColors(),
    score: 0,
    level: 1,
    chain: 0,
    maxChain: 0,
    phase: 'idle',
    totalPopped: 0,
    poppingCells: [],
    popGen: 0,
    paused: false,
  };
}

function landPiece(state: GameState): GameState {
  if (!state.currentPiece) return state;
  const placed = placePiece(state.board, state.currentPiece);
  // Settle any floating puyos (e.g. horizontal pair where one side had more room below)
  const settled = applyGravity(placed);

  if (isGameOver(settled)) {
    return { ...state, board: settled, currentPiece: null, phase: 'gameover' };
  }

  const pops = findPops(settled);
  if (pops.length) {
    return {
      ...state,
      board: settled,
      currentPiece: null,
      phase: 'popping',
      poppingCells: pops,
      popGen: state.popGen + 1,
      chain: 0,
    };
  }

  const [mc, sc] = state.nextColors;
  return {
    ...state,
    board: settled,
    currentPiece: spawnPiece(mc, sc),
    nextColors: randomColors(),
    phase: 'falling',
    chain: 0,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
    case 'RESTART': {
      const [mc, sc] = randomColors();
      return {
        ...getInitialState(),
        currentPiece: spawnPiece(mc, sc),
        nextColors: randomColors(),
        phase: 'falling',
      };
    }

    case 'TOGGLE_PAUSE': {
      if (state.phase !== 'falling' && state.phase !== 'popping') return state;
      return { ...state, paused: !state.paused };
    }

    case 'TICK':
    case 'SOFT_DROP': {
      if (state.phase !== 'falling' || state.paused || !state.currentPiece) return state;
      const moved: Piece = { ...state.currentPiece, y: state.currentPiece.y + 1 };
      if (isPieceValid(state.board, moved)) return { ...state, currentPiece: moved };
      return landPiece(state);
    }

    case 'HARD_DROP': {
      if (state.phase !== 'falling' || state.paused || !state.currentPiece) return state;
      let piece = state.currentPiece;
      while (true) {
        const moved: Piece = { ...piece, y: piece.y + 1 };
        if (!isPieceValid(state.board, moved)) break;
        piece = moved;
      }
      return landPiece({ ...state, currentPiece: piece });
    }

    case 'MOVE': {
      if (state.phase !== 'falling' || state.paused || !state.currentPiece) return state;
      const moved: Piece = { ...state.currentPiece, x: state.currentPiece.x + action.dx };
      if (!isPieceValid(state.board, moved)) return state;
      return { ...state, currentPiece: moved };
    }

    case 'ROTATE': {
      if (state.phase !== 'falling' || state.paused || !state.currentPiece) return state;
      return { ...state, currentPiece: tryRotate(state.board, state.currentPiece, action.dir) };
    }

    case 'EXECUTE_POP': {
      if (state.phase !== 'popping') return state;

      const afterPop = state.board.map(row => [...row]);
      for (const { x, y } of state.poppingCells) afterPop[y][x] = null;
      const afterGravity = applyGravity(afterPop);

      const newChain = state.chain + 1;
      const scoreGain = calcScore(state.poppingCells.length, newChain, state.level);
      const newTotalPopped = state.totalPopped + state.poppingCells.length;
      const newLevel = Math.floor(newTotalPopped / 20) + 1;
      const newMaxChain = Math.max(state.maxChain, newChain);

      const nextPops = findPops(afterGravity);
      if (nextPops.length) {
        return {
          ...state,
          board: afterGravity,
          phase: 'popping',
          poppingCells: nextPops,
          popGen: state.popGen + 1,
          chain: newChain,
          maxChain: newMaxChain,
          score: state.score + scoreGain,
          totalPopped: newTotalPopped,
          level: newLevel,
        };
      }

      const [mc, sc] = state.nextColors;
      return {
        ...state,
        board: afterGravity,
        currentPiece: spawnPiece(mc, sc),
        nextColors: randomColors(),
        phase: 'falling',
        poppingCells: [],
        chain: newChain,
        maxChain: newMaxChain,
        score: state.score + scoreGain,
        totalPopped: newTotalPopped,
        level: newLevel,
      };
    }

    default:
      return state;
  }
}

export function usePuyoGame() {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);

  // Auto-drop
  useEffect(() => {
    if (state.phase !== 'falling' || state.paused) return;
    const id = setInterval(() => dispatch({ type: 'TICK' }), dropInterval(state.level));
    return () => clearInterval(id);
  }, [state.phase, state.level, state.paused]);

  // Pop animation timer — fires each time a new pop set starts
  useEffect(() => {
    if (state.phase !== 'popping' || state.paused) return;
    sfx.pop(state.chain);
    const id = setTimeout(() => dispatch({ type: 'EXECUTE_POP' }), POP_ANIM_MS);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.popGen, state.paused]);

  // Game over sound
  useEffect(() => {
    if (state.phase === 'gameover') sfx.gameover();
  }, [state.phase]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault(); dispatch({ type: 'MOVE', dx: -1 }); sfx.move(); break;
        case 'ArrowRight':
          e.preventDefault(); dispatch({ type: 'MOVE', dx: 1 }); sfx.move(); break;
        case 'ArrowDown':
          e.preventDefault(); dispatch({ type: 'SOFT_DROP' }); break;
        case ' ':
          e.preventDefault(); dispatch({ type: 'HARD_DROP' }); sfx.hardDrop(); break;
        case 'ArrowUp':
        case 'z': case 'Z':
          e.preventDefault(); dispatch({ type: 'ROTATE', dir: -1 }); sfx.rotate(); break;
        case 'x': case 'X':
          e.preventDefault(); dispatch({ type: 'ROTATE', dir: 1 }); sfx.rotate(); break;
        case 'p': case 'P':
          e.preventDefault(); dispatch({ type: 'TOGGLE_PAUSE' }); break;
        case 'Enter':
          if (state.phase === 'idle' || state.phase === 'gameover') {
            enableSounds();
            dispatch({ type: 'START' });
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state.phase]);

  return {
    state,
    start:       useCallback(() => { enableSounds(); dispatch({ type: 'START' }); }, []),
    restart:     useCallback(() => { enableSounds(); dispatch({ type: 'RESTART' }); }, []),
    togglePause: useCallback(() => dispatch({ type: 'TOGGLE_PAUSE' }), []),
    moveLeft:    useCallback(() => { dispatch({ type: 'MOVE', dx: -1 }); sfx.move(); }, []),
    moveRight:   useCallback(() => { dispatch({ type: 'MOVE', dx: 1 });  sfx.move(); }, []),
    softDrop:    useCallback(() => dispatch({ type: 'SOFT_DROP' }), []),
    hardDrop:    useCallback(() => { dispatch({ type: 'HARD_DROP' }); sfx.hardDrop(); }, []),
    rotateCW:    useCallback(() => { dispatch({ type: 'ROTATE', dir: 1 });  sfx.rotate(); }, []),
    rotateCCW:   useCallback(() => { dispatch({ type: 'ROTATE', dir: -1 }); sfx.rotate(); }, []),
  };
}
