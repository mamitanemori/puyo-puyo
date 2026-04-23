let _ctx: AudioContext | null = null;
let _enabled = false;

export function enableSounds(): void {
  _enabled = true;
  if (typeof window === 'undefined') return;
  if (!_ctx) _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2): void {
  if (!_enabled || !_ctx) return;
  const c = _ctx;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur + 0.01);
}

export const sfx = {
  move:     () => tone(220, 0.05, 'sine', 0.1),
  rotate:   () => tone(330, 0.06, 'triangle', 0.1),
  land:     () => tone(110, 0.12, 'triangle', 0.22),
  hardDrop: () => { tone(90, 0.08, 'triangle', 0.28); tone(70, 0.15, 'triangle', 0.2); },
  pop: (chain: number) => {
    const base = 330 + chain * 90;
    tone(base,        0.08, 'square', 0.14);
    setTimeout(() => tone(base * 1.26, 0.08, 'square', 0.10), 55);
    setTimeout(() => tone(base * 1.59, 0.10, 'square', 0.08), 110);
  },
  gameover: () => {
    [440, 350, 280, 210, 150].forEach((f, i) =>
      setTimeout(() => tone(f, 0.28, 'sawtooth', 0.16), i * 130)
    );
  },
};
