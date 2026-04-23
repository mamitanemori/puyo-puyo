'use client';
import { useEffect, useRef, useState } from 'react';
import { usePuyoGame } from '@/hooks/usePuyoGame';
import { useHighScore } from '@/hooks/useHighScore';
import { getSatellitePos, getGhostPiece, COLS, ROWS } from '@/lib/puyoLogic';
import type { Cell, PuyoColor } from '@/types/puyo';

// 8-spike star polygon (outer r=47, inner r=30, center 50,50)
const SPIKE_CLIP = 'polygon(50% 3%, 62% 22%, 83% 17%, 78% 39%, 97% 50%, 78% 61%, 83% 83%, 62% 78%, 50% 97%, 38% 78%, 17% 83%, 22% 61%, 3% 50%, 22% 39%, 17% 17%, 38% 22%)';
const SPIKE_SVG  = '50,3 62,22 83,17 78,39 97,50 78,61 83,83 62,78 50,97 38,78 17,83 22,61 3,50 22,39 17,17 38,22';

const PUYO_STYLES: Record<PuyoColor, { bg: string; glow: string; border: string }> = {
  red:    { bg: 'radial-gradient(circle at 35% 28%, #ffaaaa, #dd1111 65%)', glow: '#ff3333', border: '#ff5555' },
  blue:   { bg: 'radial-gradient(circle at 35% 28%, #aabbff, #1133dd 65%)', glow: '#3366ff', border: '#5588ff' },
  green:  { bg: 'radial-gradient(circle at 35% 28%, #aaffbb, #11cc22 65%)', glow: '#22cc33', border: '#44ee55' },
  yellow: { bg: 'radial-gradient(circle at 35% 28%, #ffee99, #ee9900 65%)', glow: '#ffbb00', border: '#ffcc33' },
  purple: { bg: 'radial-gradient(circle at 35% 28%, #ddaaff, #9911dd 65%)', glow: '#aa22ff', border: '#cc55ff' },
};

type CellMode = 'normal' | 'ghost' | 'popping';

function Puyo({ color, mode = 'normal' }: { color: PuyoColor; mode?: CellMode }) {
  const s = PUYO_STYLES[color];
  if (mode === 'ghost') {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <polygon points={SPIKE_SVG} fill="none" stroke={s.border} strokeWidth="2.5" strokeDasharray="5 3" opacity="0.45" />
      </svg>
    );
  }
  return (
    <div className="w-full h-full" style={{ filter: `drop-shadow(0 0 5px ${s.glow}bb) drop-shadow(0 1px 3px rgba(0,0,0,0.6))` }}>
      <div
        className={`w-full h-full relative select-none ${mode === 'popping' ? 'puyo-popping' : ''}`}
        style={{ clipPath: SPIKE_CLIP, background: s.bg, transformOrigin: 'center' }}
      >
        <div className="absolute" style={{ top: '12%', left: '22%', width: '30%', height: '22%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, transparent 80%)', borderRadius: '50%', transform: 'rotate(-20deg)' }} />
        <div className="absolute rounded-full bg-black" style={{ top: '36%', left: '24%',  width: '18%', height: '18%' }} />
        <div className="absolute rounded-full bg-black" style={{ top: '36%', right: '24%', width: '18%', height: '18%' }} />
        <div className="absolute rounded-full bg-white" style={{ top: '38%', left: '26%',  width: '8%',  height: '8%'  }} />
        <div className="absolute rounded-full bg-white" style={{ top: '38%', right: '26%', width: '8%',  height: '8%'  }} />
      </div>
    </div>
  );
}

// ── Layout hook ──────────────────────────────────────────────────────────────
// Returns cell size and whether to use mobile (vertical) layout.
// Starts with desktop defaults to avoid SSR hydration mismatch.
function useLayout() {
  const [layout, setLayout] = useState({ cell: 46, mobile: false });

  useEffect(() => {
    function compute() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const portrait = vh >= vw;

      if (vw < 600 && portrait) {
        // Mobile portrait: vertical layout
        // Reserved: stats(52px) + controls(108px) + padding(28px) = 188px
        const byW = Math.floor((vw - 8) / COLS);
        const byH = Math.floor((vh - 188) / ROWS);
        return { cell: Math.max(24, Math.min(byW, byH)), mobile: true };
      } else {
        // Desktop or landscape: horizontal layout (board + side panel 180px)
        const byH = Math.floor((vh - 32) / ROWS);
        const byW = Math.floor((vw - 212) / COLS);
        return { cell: Math.max(24, Math.min(46, byW, byH)), mobile: false };
      }
    }
    setLayout(compute());
    window.addEventListener('resize', () => setLayout(compute()));
    return () => window.removeEventListener('resize', () => setLayout(compute()));
  }, []);

  return layout;
}

// ── Board renderer ────────────────────────────────────────────────────────────
function GameBoard({ display, cell }: { display: ({ color: PuyoColor; mode: CellMode } | null)[][]; cell: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${COLS}, ${cell}px)`,
      gridTemplateRows: `repeat(${ROWS}, ${cell}px)`,
      gap: '1px',
      background: 'linear-gradient(180deg, #0c0a1a 0%, #080614 100%)',
    }}>
      {display.map((row, y) =>
        row.map((cell_data, x) => (
          <div
            key={`${y}-${x}`}
            style={{
              width: cell, height: cell, padding: Math.max(2, Math.floor(cell * 0.06)),
              background: (y + x) % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
            }}
          >
            {cell_data && <Puyo color={cell_data.color} mode={cell_data.mode} />}
          </div>
        ))
      )}
    </div>
  );
}

// ── Control buttons ───────────────────────────────────────────────────────────
function Controls({ rotateCCW, hardDrop, rotateCW, moveLeft, softDrop, moveRight, size = 'md' }:
  { rotateCCW: () => void; hardDrop: () => void; rotateCW: () => void; moveLeft: () => void; softDrop: () => void; moveRight: () => void; size?: 'sm' | 'md' }) {
  const py = size === 'sm' ? 'py-2' : 'py-3';
  const btns = [
    { label: '↺', fn: rotateCCW, cls: 'bg-violet-900/80 hover:bg-violet-800' },
    { label: '↑', fn: hardDrop,  cls: 'bg-gray-800 hover:bg-gray-700' },
    { label: '↻', fn: rotateCW,  cls: 'bg-violet-900/80 hover:bg-violet-800' },
    { label: '←', fn: moveLeft,  cls: 'bg-gray-800 hover:bg-gray-700' },
    { label: '↓', fn: softDrop,  cls: 'bg-gray-800 hover:bg-gray-700' },
    { label: '→', fn: moveRight, cls: 'bg-gray-800 hover:bg-gray-700' },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5 w-full">
      {btns.map(({ label, fn, cls }) => (
        <button key={label} onPointerDown={fn}
          className={`${cls} ${py} text-white text-lg font-bold rounded-xl active:scale-90 transition-transform select-none`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PuyoGame() {
  const { state, start, restart, togglePause, moveLeft, moveRight, softDrop, hardDrop, rotateCW, rotateCCW } = usePuyoGame();
  const { board, currentPiece, nextColors, score, level, chain, maxChain, phase, poppingCells, paused } = state;
  const { highScore, update: updateHighScore } = useHighScore();
  const { cell, mobile } = useLayout();

  useEffect(() => {
    if (phase === 'gameover') updateHighScore(score);
  }, [phase, score, updateHighScore]);

  // Swipe gesture
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      if (!touchStart.current || phase !== 'falling') return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.t;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        dx > 0 ? moveRight() : moveLeft();
      } else {
        dy > 0 ? (dt < 200 ? hardDrop() : softDrop()) : rotateCW();
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, [phase, moveLeft, moveRight, softDrop, hardDrop, rotateCW]);

  // Build display board
  const poppingSet = new Set(poppingCells.map(c => `${c.x},${c.y}`));
  type DisplayCell = { color: PuyoColor; mode: CellMode } | null;
  const display: DisplayCell[][] = board.map((row, y) =>
    row.map((c, x): DisplayCell => c ? { color: c, mode: poppingSet.has(`${x},${y}`) ? 'popping' : 'normal' } : null)
  );
  if (currentPiece && (phase === 'falling' || phase === 'popping')) {
    const ghost = getGhostPiece(board, currentPiece);
    const ghostSub = getSatellitePos(ghost);
    if (ghost.y >= 0 && ghost.y < ROWS && !display[ghost.y][ghost.x])
      display[ghost.y][ghost.x] = { color: currentPiece.mainColor, mode: 'ghost' };
    if (ghostSub.y >= 0 && ghostSub.y < ROWS && !display[ghostSub.y][ghostSub.x])
      display[ghostSub.y][ghostSub.x] = { color: currentPiece.subColor, mode: 'ghost' };
    if (currentPiece.y >= 0 && currentPiece.y < ROWS)
      display[currentPiece.y][currentPiece.x] = { color: currentPiece.mainColor, mode: 'normal' };
    const sub = getSatellitePos(currentPiece);
    if (sub.y >= 0 && sub.y < ROWS)
      display[sub.y][sub.x] = { color: currentPiece.subColor, mode: 'normal' };
  }

  const isActive = phase === 'falling' || phase === 'popping';
  const boardW = cell * COLS + (COLS - 1); // board pixel width incl. gaps

  // ── Overlays (shared) ────────────────────────────────────────────────────
  const overlays = (
    <>
      {paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm rounded-2xl">
          <div className="text-4xl font-black text-white mb-2">PAUSE</div>
          <button onClick={togglePause} className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold transition-all">再開</button>
        </div>
      )}
      {phase === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm rounded-2xl">
          <div className="text-3xl font-bold text-red-400 mb-2">GAME OVER</div>
          <div className="text-gray-300 font-mono text-lg mb-1">{score.toLocaleString()} pts</div>
          {score >= highScore && score > 0 && <div className="text-yellow-400 text-sm font-bold mb-1">NEW RECORD!</div>}
          <div className="text-purple-400 text-sm mb-1">最大チェーン {maxChain}</div>
          <div className="text-gray-500 text-xs mb-5">BEST {highScore.toLocaleString()}</div>
          <button onClick={restart} className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-lg transition-all">もう一度</button>
        </div>
      )}
      {phase === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl">
          <div className="text-4xl font-black tracking-tight mb-1" style={{ background: 'linear-gradient(135deg,#818cf8,#c084fc,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ぷよぷよ
          </div>
          <div className="text-gray-500 text-xs tracking-[0.3em] mb-6">PUYO PUYO</div>
          {highScore > 0 && <div className="text-gray-400 text-sm mb-3">BEST {highScore.toLocaleString()}</div>}
          <button onClick={start} className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-lg transition-all" style={{ boxShadow: '0 0 24px #6366f155' }}>
            スタート
          </button>
          {!mobile && (
            <div className="mt-5 text-gray-600 text-xs text-center leading-6">
              ← → 移動 | ↓ ソフトドロップ | Space ハードドロップ<br />Z/X 回転 | P ポーズ
            </div>
          )}
        </div>
      )}
    </>
  );

  // ── Mobile layout ────────────────────────────────────────────────────────
  if (mobile) {
    const miniPuyo = Math.round(cell * 0.65);
    return (
      <div className="flex flex-col items-center min-h-screen bg-gray-950 pt-2 px-1 pb-2" style={{ gap: 6 }}>
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full text-xs" style={{ maxWidth: boardW, minHeight: 44 }}>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-gray-500 text-[9px] tracking-widest uppercase">Score</span>
            <span className="text-white font-mono font-bold">{score.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-gray-500 text-[9px] tracking-widest uppercase">Best</span>
            <span className="text-yellow-400 font-mono font-bold">{highScore.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-gray-500 text-[9px] tracking-widest uppercase">Lv</span>
            <span className="text-indigo-300 font-mono font-bold">{level}</span>
          </div>
          {chain > 0 ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-gray-500 text-[9px] tracking-widest uppercase">Chain</span>
              <span className="text-yellow-400 font-mono font-bold chain-flash">{chain}!</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-gray-500 text-[9px] tracking-widest uppercase">Max</span>
              <span className="text-purple-400 font-mono font-bold">{maxChain}</span>
            </div>
          )}
          {/* Next piece */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-gray-500 text-[9px] tracking-widest uppercase">Next</span>
            <div className="flex gap-1">
              {nextColors.map((color, i) => (
                <div key={i} style={{ width: miniPuyo, height: miniPuyo }}>
                  <Puyo color={color} />
                </div>
              ))}
            </div>
          </div>
          {/* Pause button */}
          {isActive && (
            <button onClick={togglePause} className="text-gray-400 hover:text-white text-lg px-1 active:scale-90 transition-transform">
              {paused ? '▶' : '⏸'}
            </button>
          )}
        </div>

        {/* Board */}
        <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: '0 0 30px #6366f122, 0 0 0 1.5px #3730a344' }}>
          <GameBoard display={display} cell={cell} />
          {overlays}
        </div>

        {/* Controls */}
        {isActive && !paused && (
          <div style={{ width: boardW, maxWidth: '100%' }}>
            <Controls rotateCCW={rotateCCW} hardDrop={hardDrop} rotateCW={rotateCW} moveLeft={moveLeft} softDrop={softDrop} moveRight={moveRight} size="sm" />
          </div>
        )}
      </div>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="flex items-start gap-5">
        {/* Board */}
        <div className="relative rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 50px #6366f122, 0 0 0 2px #3730a344' }}>
          <GameBoard display={display} cell={cell} />
          {overlays}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-3 w-36">
          {[
            { label: 'SCORE',     val: score.toLocaleString(),     color: 'text-white'      },
            { label: 'BEST',      val: highScore.toLocaleString(), color: 'text-yellow-400' },
            { label: 'LEVEL',     val: level,                      color: 'text-indigo-300' },
            { label: 'MAX CHAIN', val: maxChain,                   color: 'text-purple-400' },
          ].map(({ label, val, color }) => (
            <div key={label} className="rounded-xl border border-indigo-900/60 bg-gray-900/80 px-4 py-3 backdrop-blur-sm">
              <div className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-1">{label}</div>
              <div className={`font-mono text-xl font-bold ${color}`}>{val}</div>
            </div>
          ))}
          {chain > 0 && (
            <div className="rounded-xl border border-yellow-700/70 bg-gray-900/80 px-4 py-3 backdrop-blur-sm">
              <div className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-1">CHAIN</div>
              <div className="font-mono text-xl font-bold text-yellow-400 chain-flash">{chain}連鎖!</div>
            </div>
          )}
          {/* Next piece */}
          <div className="rounded-xl border border-indigo-900/60 bg-gray-900/80 px-4 py-3 backdrop-blur-sm">
            <div className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-2">NEXT</div>
            <div className="flex flex-col gap-1.5 items-start mt-1">
              {nextColors.map((color, i) => (
                <div key={i} style={{ width: 34, height: 34, padding: 2 }}><Puyo color={color} /></div>
              ))}
            </div>
          </div>
          {isActive && (
            <button onClick={togglePause} className="rounded-xl border border-indigo-900/60 bg-gray-900/80 px-4 py-2 text-gray-400 hover:text-white text-xs font-semibold tracking-widest uppercase transition-colors">
              {paused ? '▶ 再開' : '⏸ ポーズ'}
            </button>
          )}
          {isActive && !paused && (
            <Controls rotateCCW={rotateCCW} hardDrop={hardDrop} rotateCW={rotateCW} moveLeft={moveLeft} softDrop={softDrop} moveRight={moveRight} />
          )}
        </div>
      </div>
    </div>
  );
}
