'use client';
import { useEffect, useRef } from 'react';
import { usePuyoGame } from '@/hooks/usePuyoGame';
import { useHighScore } from '@/hooks/useHighScore';
import { getSatellitePos, getGhostPiece, COLS, ROWS } from '@/lib/puyoLogic';
import type { Cell, PuyoColor } from '@/types/puyo';

const CELL = 46;

// 8-spike star polygon (outer r=47, inner r=30, center 50,50)
const SPIKE_CLIP = 'polygon(50% 3%, 62% 22%, 83% 17%, 78% 39%, 97% 50%, 78% 61%, 83% 83%, 62% 78%, 50% 97%, 38% 78%, 17% 83%, 22% 61%, 3% 50%, 22% 39%, 17% 17%, 38% 22%)';
const SPIKE_SVG  = '50,3 62,22 83,17 78,39 97,50 78,61 83,83 62,78 50,97 38,78 17,83 22,61 3,50 22,39 17,17 38,22';

const PUYO_STYLES: Record<PuyoColor, { bg: string; light: string; dark: string; glow: string; border: string }> = {
  red:    { bg: 'radial-gradient(circle at 35% 28%, #ffaaaa, #dd1111 65%)', light: '#ffaaaa', dark: '#dd1111', glow: '#ff3333', border: '#ff5555' },
  blue:   { bg: 'radial-gradient(circle at 35% 28%, #aabbff, #1133dd 65%)', light: '#aabbff', dark: '#1133dd', glow: '#3366ff', border: '#5588ff' },
  green:  { bg: 'radial-gradient(circle at 35% 28%, #aaffbb, #11cc22 65%)', light: '#aaffbb', dark: '#11cc22', glow: '#22cc33', border: '#44ee55' },
  yellow: { bg: 'radial-gradient(circle at 35% 28%, #ffee99, #ee9900 65%)', light: '#ffee99', dark: '#ee9900', glow: '#ffbb00', border: '#ffcc33' },
  purple: { bg: 'radial-gradient(circle at 35% 28%, #ddaaff, #9911dd 65%)', light: '#ddaaff', dark: '#9911dd', glow: '#aa22ff', border: '#cc55ff' },
};

type CellMode = 'normal' | 'ghost' | 'popping';

function Puyo({ color, mode = 'normal' }: { color: PuyoColor; mode?: CellMode }) {
  const s = PUYO_STYLES[color];

  if (mode === 'ghost') {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <polygon
          points={SPIKE_SVG}
          fill="none"
          stroke={s.border}
          strokeWidth="2.5"
          strokeDasharray="5 3"
          opacity="0.45"
        />
      </svg>
    );
  }

  return (
    // outer wrapper provides drop-shadow (clip-path would clip box-shadow)
    <div
      className="w-full h-full"
      style={{ filter: `drop-shadow(0 0 5px ${s.glow}bb) drop-shadow(0 1px 3px rgba(0,0,0,0.6))` }}
    >
      <div
        className={`w-full h-full relative select-none ${mode === 'popping' ? 'puyo-popping' : ''}`}
        style={{ clipPath: SPIKE_CLIP, background: s.bg, transformOrigin: 'center' }}
      >
        {/* shine */}
        <div
          className="absolute"
          style={{
            top: '12%', left: '22%', width: '30%', height: '22%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, transparent 80%)',
            borderRadius: '50%',
            transform: 'rotate(-20deg)',
          }}
        />
        {/* eyes */}
        <div className="absolute rounded-full bg-black" style={{ top: '36%', left: '24%',  width: '18%', height: '18%' }} />
        <div className="absolute rounded-full bg-black" style={{ top: '36%', right: '24%', width: '18%', height: '18%' }} />
        <div className="absolute rounded-full bg-white" style={{ top: '38%', left: '26%',  width: '8%',  height: '8%'  }} />
        <div className="absolute rounded-full bg-white" style={{ top: '38%', right: '26%', width: '8%',  height: '8%'  }} />
      </div>
    </div>
  );
}

function Panel({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border ${accent ? 'border-yellow-700/70' : 'border-indigo-900/60'} bg-gray-900/80 px-4 py-3 backdrop-blur-sm`}>
      <div className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-1">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <Panel label={label}>
      <div className={`font-mono text-xl font-bold ${color}`}>{value}</div>
    </Panel>
  );
}

export function PuyoGame() {
  const { state, start, restart, togglePause, moveLeft, moveRight, softDrop, hardDrop, rotateCW, rotateCCW } = usePuyoGame();
  const { board, currentPiece, nextColors, score, level, chain, maxChain, phase, poppingCells, paused } = state;
  const { highScore, update: updateHighScore } = useHighScore();

  // Update high score on game over
  useEffect(() => {
    if (phase === 'gameover') updateHighScore(score);
  }, [phase, score, updateHighScore]);

  // Swipe gesture handling
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
      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 25) return;
      if (absDx > absDy) {
        if (dx > 0) moveRight(); else moveLeft();
      } else {
        if (dy > 0) {
          dt < 200 ? hardDrop() : softDrop();
        } else {
          rotateCW();
        }
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [phase, moveLeft, moveRight, softDrop, hardDrop, rotateCW]);

  // Build display board
  const poppingSet = new Set(poppingCells.map(c => `${c.x},${c.y}`));
  type DisplayCell = { color: PuyoColor; mode: CellMode } | null;
  const display: DisplayCell[][] = board.map((row, y) =>
    row.map((cell, x): DisplayCell => {
      if (!cell) return null;
      return { color: cell, mode: poppingSet.has(`${x},${y}`) ? 'popping' : 'normal' };
    })
  );

  if (currentPiece && (phase === 'falling' || phase === 'popping')) {
    const ghost = getGhostPiece(board, currentPiece);

    // Ghost
    const ghostSub = getSatellitePos(ghost);
    if (ghost.y >= 0 && ghost.y < ROWS && !display[ghost.y][ghost.x])
      display[ghost.y][ghost.x] = { color: currentPiece.mainColor, mode: 'ghost' };
    if (ghostSub.y >= 0 && ghostSub.y < ROWS && !display[ghostSub.y][ghostSub.x])
      display[ghostSub.y][ghostSub.x] = { color: currentPiece.subColor, mode: 'ghost' };

    // Current piece
    if (currentPiece.y >= 0 && currentPiece.y < ROWS)
      display[currentPiece.y][currentPiece.x] = { color: currentPiece.mainColor, mode: 'normal' };
    const sub = getSatellitePos(currentPiece);
    if (sub.y >= 0 && sub.y < ROWS)
      display[sub.y][sub.x] = { color: currentPiece.subColor, mode: 'normal' };
  }

  const isActive = phase === 'falling' || phase === 'popping';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="flex items-start gap-5">

        {/* Board */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 0 50px #6366f122, 0 0 0 2px #3730a344' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
              gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
              gap: '1px',
              backgroundColor: '#1e1b4b14',
              background: 'linear-gradient(180deg, #0c0a1a 0%, #080614 100%)',
            }}
          >
            {display.map((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`${y}-${x}`}
                  style={{
                    width: CELL,
                    height: CELL,
                    padding: 3,
                    background: (y + x) % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  }}
                >
                  {cell && <Puyo color={cell.color} mode={cell.mode} />}
                </div>
              ))
            )}
          </div>

          {/* Pause overlay */}
          {paused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm rounded-2xl">
              <div className="text-4xl font-black text-white mb-2">PAUSE</div>
              <div className="text-gray-400 text-sm mb-6">P キーまたはボタンで再開</div>
              <button
                onClick={togglePause}
                className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold transition-all"
              >
                再開
              </button>
            </div>
          )}

          {/* Game over overlay */}
          {phase === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm rounded-2xl">
              <div className="text-3xl font-bold text-red-400 mb-3">GAME OVER</div>
              <div className="text-gray-300 font-mono text-lg mb-1">{score.toLocaleString()} pts</div>
              {score >= highScore && score > 0 && (
                <div className="text-yellow-400 text-sm font-bold mb-1">NEW RECORD!</div>
              )}
              <div className="text-purple-400 text-sm mb-1">最大チェーン {maxChain}</div>
              <div className="text-gray-500 text-xs mb-6">ハイスコア {highScore.toLocaleString()}</div>
              <button
                onClick={restart}
                className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-lg transition-all"
              >
                もう一度
              </button>
            </div>
          )}

          {/* Start overlay */}
          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl">
              <div
                className="text-5xl font-black tracking-tight mb-1"
                style={{ background: 'linear-gradient(135deg,#818cf8,#c084fc,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                ぷよぷよ
              </div>
              <div className="text-gray-500 text-xs tracking-[0.3em] mb-8">PUYO PUYO</div>
              {highScore > 0 && (
                <div className="text-gray-400 text-sm mb-4">BEST: {highScore.toLocaleString()}</div>
              )}
              <button
                onClick={start}
                className="px-10 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-lg transition-all"
                style={{ boxShadow: '0 0 24px #6366f155' }}
              >
                スタート
              </button>
              <div className="mt-6 text-gray-600 text-xs text-center leading-6">
                ← → 移動 &nbsp;|&nbsp; ↓ ソフトドロップ<br />
                Space ハードドロップ &nbsp;|&nbsp; Z/X 回転<br />
                P ポーズ
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-3 w-36">
          <Stat label="SCORE"     value={score.toLocaleString()} />
          <Stat label="BEST"      value={highScore.toLocaleString()} color="text-yellow-400" />
          <Stat label="LEVEL"     value={level}   color="text-indigo-300" />
          {chain > 0 && (
            <Panel label="CHAIN" accent>
              <div className="font-mono text-xl font-bold text-yellow-400 chain-flash">{chain}連鎖!</div>
            </Panel>
          )}
          <Stat label="MAX CHAIN" value={maxChain} color="text-purple-400" />

          {/* Next piece */}
          <Panel label="NEXT">
            <div className="flex flex-col gap-1.5 items-start mt-1">
              {nextColors.map((color, i) => (
                <div key={i} style={{ width: 34, height: 34, padding: 2 }}>
                  <Puyo color={color} />
                </div>
              ))}
            </div>
          </Panel>

          {/* Pause button (game active) */}
          {isActive && (
            <button
              onClick={togglePause}
              className="rounded-xl border border-indigo-900/60 bg-gray-900/80 px-4 py-2 text-gray-400 hover:text-white text-xs font-semibold tracking-widest uppercase transition-colors"
            >
              {paused ? '▶ 再開' : '⏸ ポーズ'}
            </button>
          )}

          {/* Mobile controls */}
          {isActive && !paused && (
            <div className="grid grid-cols-3 gap-1 mt-1">
              {[
                { label: '↺', fn: rotateCCW, cls: 'bg-violet-900/80 hover:bg-violet-800' },
                { label: '↑', fn: hardDrop,  cls: 'bg-gray-800 hover:bg-gray-700' },
                { label: '↻', fn: rotateCW,  cls: 'bg-violet-900/80 hover:bg-violet-800' },
                { label: '←', fn: moveLeft,  cls: 'bg-gray-800 hover:bg-gray-700' },
                { label: '↓', fn: softDrop,  cls: 'bg-gray-800 hover:bg-gray-700' },
                { label: '→', fn: moveRight, cls: 'bg-gray-800 hover:bg-gray-700' },
              ].map(({ label, fn, cls }) => (
                <button
                  key={label}
                  onPointerDown={fn}
                  className={`${cls} text-white text-base py-2 rounded-lg active:scale-90 transition-transform select-none`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
