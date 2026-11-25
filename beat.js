// Бит и метроном: темп отстуком, бит из «Файлов» по кругу, клик поверх. Записи лежат там же, где напевы.
import { warm, urlOf } from './hum.js';
const B = { on:'', id:'', meta:null, bpm:90, vol:.8, click:false, wood:'block', el:null, ctx:null, gain:null, timer:0, n:0, t0:0, taps:[], last:-1, change:() => {}, err:() => {} };
export const onBeat = (f, e) => { B.change = f; B.err = e || (() => {}); };
export const beatState = () => ({ on:B.on, id:B.id, bpm:B.bpm, vol:B.vol, click:B.click, wood:B.wood });
const session = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} };
function ctx(){ if (!B.ctx || B.ctx.state === 'closed') { const C = window.AudioContext || window.webkitAudioContext; B.ctx = new C(); B.gain = B.ctx.createGain(); B.gain.gain.value = B.vol; B.gain.connect(B.ctx.destination); }
  if (B.ctx.state !== 'running') B.ctx.resume().catch(() => {}); return B.ctx; }
// деревянный щелчок: затухающие тоны бруска и короткий сухой удар. [частота, громкость, затухание в секундах]
export const WOODS = [['block', 'коробочка'], ['log', 'глухое дерево'], ['sticks', 'палочки']];
const WOOD = {
  block:{ f:760, m:[[1, 1, .026], [1.52, .5, .017], [2.74, .22, .009], [4.1, .08, .005]], k:.4, lp:.35, up:1.26 },
  log:{ f:395, m:[[1, 1, .04], [1.68, .42, .024], [2.9, .16, .012]], k:.5, lp:.16, up:1.22 },
  sticks:{ f:1480, m:[[1, 1, .02], [1.06, .4, .024], [2.6, .13, .007]], k:.3, lp:.5, up:1.18 } };
const WB = new Map();
function woodBuf(one){ const c = B.ctx, key = B.wood + one + c.sampleRate; if (WB.has(key)) return WB.get(key); const w = WOOD[B.wood] || WOOD.block, sr = c.sampleRate, n = Math.floor(sr * .22), b = c.createBuffer(1, n, sr), d = b.getChannelData(0), f = w.f * (one ? w.up : 1); let lp = 0, top = 0;
  for (let i = 0; i < n; i++) { const x = i / sr; let s = 0; for (const [r, a, dc] of w.m) s += a * Math.exp(-x / dc) * Math.sin(6.28318 * f * r * x);
    lp += w.lp * ((Math.random() * 2 - 1) - lp); s += w.k * lp * Math.exp(-x / .0028); d[i] = s * Math.min(1, x / .0006); top = Math.max(top, Math.abs(d[i])); }
  for (let i = 0; i < n; i++) d[i] *= (one ? .95 : .62) / top; WB.set(key, b); return b; }
function tick(at, one){ const s = B.ctx.createBufferSource(); s.buffer = woodBuf(!!one); s.connect(B.gain); s.start(at); }
export function setWood(k, hear){ B.wood = WOOD[k] ? k : 'block'; if (hear && B.on !== 'metro') { session('playback'); const c = ctx(), t = c.currentTime + .06; tick(t, true); [1, 2, 3].forEach(i => tick(t + i * .42, false)); } }
const per = () => 60 / B.bpm;
// щелчки ставятся с запасом, чтобы темп не плавал
function pump(){
  if (B.on === 'metro') { const c = B.ctx; if (c.state !== 'running') return; if (!B.t0 || B.t0 + B.n * per() < c.currentTime - .3) { B.t0 = c.currentTime + .08 - B.n * per(); }
    while (B.t0 + B.n * per() < c.currentTime + .14) { tick(B.t0 + B.n * per(), B.n % 4 === 0); B.n++; } return; }
  if (B.on === 'beat' && B.click && B.meta && B.meta.bpm && B.el && !B.el.paused) { const c = ctx(); if (c.state !== 'running') return; const pos = B.el.currentTime, off = B.meta.off || 0; let k = Math.ceil((pos - off) / per() + .02); if (pos < B.lastPos - .5) B.last = -1e9; B.lastPos = pos;
    for (; off + k * per() < pos + .16; k++) if (k > B.last) { B.last = k; tick(c.currentTime + Math.max(.005, off + k * per() - pos), ((k % 4) + 4) % 4 === 0); } }
}
// какая сейчас доля: 0–3, или −1
export function beatPhase(){
  if (B.on === 'metro' && B.ctx && B.t0) { const x = (B.ctx.currentTime - B.t0) / per(); return x < 0 ? -1 : Math.floor(x) % 4; }
  if (B.on === 'beat' && B.el && B.meta && B.meta.bpm) { const x = Math.floor((B.el.currentTime - (B.meta.off || 0)) / per()); return ((x % 4) + 4) % 4; }
  return -1; }
export const beatPos = () => B.on === 'beat' && B.el ? B.el.currentTime : null;
export function stopBeat(){ if (!B.on) return; B.on = ''; clearInterval(B.timer); if (B.el) B.el.pause(); B.taps = []; B.change(); }
export function startMetro(bpm){ if (B.on) stopBeat(); session('playback'); B.bpm = bpm || B.bpm; ctx(); B.n = 0; B.t0 = 0; B.id = ''; B.meta = null; B.on = 'metro'; B.taps = []; clearInterval(B.timer); B.timer = setInterval(pump, 25); B.change(); }
export async function startBeat(meta, at){
  if (B.on) stopBeat(); if (!urlOf(meta.id)) await warm([meta.id]); const u = urlOf(meta.id); if (!u) throw new Error('бит не найден');
  session('playback'); const a = B.el || (B.el = new Audio()); a.setAttribute('playsinline', ''); if (B.id !== meta.id || !a.src) a.src = u; a.loop = true; B.id = meta.id; B.meta = meta; B.bpm = meta.bpm || B.bpm; B.last = -1e9; B.lastPos = 0; B.taps = [];
  try { a.currentTime = at || 0; } catch (e) {}
  a.onpause = () => { if (B.on === 'beat' && a.paused && !B.hold) stopBeat(); }; a.onerror = () => { if (B.on === 'beat') { B.err('этот файл телефон не играет'); stopBeat(); } };
  B.on = 'beat'; clearInterval(B.timer); B.timer = setInterval(pump, 25); B.change();
  try { await a.play(); } catch (e) { stopBeat(); throw e; } }
// запись может поставить бит на паузу: держим и включаем обратно
export const holdBeat = v => { B.hold = v; };
export function wakeBeat(){ if (B.on === 'beat' && B.el && B.el.paused) B.el.play().catch(() => {}); if (B.on === 'metro') ctx(); }
export function seekBeat(f){ if (B.el && B.on === 'beat' && B.el.duration) { B.el.currentTime = f * B.el.duration; B.last = -1e9; } }
export const beatDur = () => B.el && B.el.duration && isFinite(B.el.duration) ? B.el.duration : 0;
export function setBpm(x){ x = Math.max(40, Math.min(240, Math.round(x * 10) / 10)); if (B.on === 'metro' && B.ctx) { const done = (B.ctx.currentTime - B.t0) / per(); B.bpm = x; B.n = Math.ceil(done); B.t0 = B.ctx.currentTime - done * per(); } else B.bpm = x; if (B.meta) B.meta.bpm = x; B.last = -1e9; return x; }
export function setVol(v){ B.vol = v; if (B.gain) B.gain.gain.value = v; }
export function setClick(v){ B.click = v; if (v) ctx(); B.last = -1e9; }
// отстук: прямая через удары. Под бит — ещё и где «раз» (первый удар)
export function tap(now){
  const beat = B.on === 'beat' && B.el, t = beat ? B.el.currentTime : now / 1000, A = B.taps, gap = A.length ? t - A[A.length - 1] : 0; if (A.length && (gap > 2 || gap <= .05)) A.length = 0;
  A.push(t); const n = A.length; if (n < 4) return { n, bpm:0 };
  if (n > 32) A.splice(0, 4);
  const m = A.length, mx = (m - 1) / 2, my = A.reduce((a, b) => a + b, 0) / m; let up = 0, dn = 0; A.forEach((y, i) => { up += (i - mx) * (y - my); dn += (i - mx) ** 2; });
  const p = up / dn; let bpm = 60 / p; if (Math.abs(bpm - Math.round(bpm)) < .25 || m < 12) bpm = Math.round(bpm); bpm = Math.max(40, Math.min(240, Math.round(bpm * 10) / 10));
  const bar = 240 / bpm, off = (((my - mx * p) % bar) + bar) % bar; return { n, bpm, off:beat ? off : null }; }
export const tapReset = () => { B.taps = []; };
