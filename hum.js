// Напевы: запись в микрофон, хранение и проигрывание. Отдельная база: тексты не затрагиваются. Всё в телефоне.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const H = { db:null, opening:null, takes:[], url:new Map(), onchange:() => {} };
export const onHum = f => { H.onchange = f; };
const idb = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export function loadTakes(){
  if (H.opening) return H.opening;
  return H.opening = new Promise((res, rej) => { const r = indexedDB.open('strokes-audio', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath:'id' }); r.result.createObjectStore('buf'); };
    r.onsuccess = () => { H.db = r.result; res(); }; r.onerror = () => rej(r.error); })
    .then(() => idb(H.db.transaction('meta').objectStore('meta').getAll())).then(a => { H.takes = a.sort((x, y) => y.created - x.created); });
}
export const takes = () => H.takes.filter(x => x.type !== 'beat');
export const beats = () => H.takes.filter(x => x.type === 'beat');
export const urlOf = id => H.url.get(id) || '';
export const takeBy = id => H.takes.find(x => x.id === id) || null;
export const takesOf = textId => takes().filter(x => x.textId === textId);
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error || new Error('хранилище')); });
export async function putTake(meta, buf){
  await loadTakes(); const tx = H.db.transaction(['meta', 'buf'], 'readwrite'); tx.objectStore('meta').put(meta); if (buf) tx.objectStore('buf').put(buf, meta.id); await done(tx);
  const i = H.takes.findIndex(x => x.id === meta.id); if (i >= 0) H.takes[i] = meta; else H.takes.unshift(meta);
  H.takes.sort((x, y) => y.created - x.created);
}
export const bufOf = id => loadTakes().then(() => idb(H.db.transaction('buf').objectStore('buf').get(id)));
export async function dropTake(id){
  if (P.id === id) stopPlay(); const meta = takeBy(id), buf = await bufOf(id);
  const tx = H.db.transaction(['meta', 'buf'], 'readwrite'); tx.objectStore('meta').delete(id); tx.objectStore('buf').delete(id); await done(tx);
  H.takes = H.takes.filter(x => x.id !== id); const u = H.url.get(id); if (u) { URL.revokeObjectURL(u); H.url.delete(id); }
  return { meta, buf };
}
export async function fileOf(id){
  const m = takeBy(id), buf = await bufOf(id), ext = /mp4/.test(m.mime) ? 'm4a' : /webm/.test(m.mime) ? 'webm' : 'ogg';
  const name = (m.name || 'напев').replace(/[\\/:*?"<>|\n]+/g, ' ').trim().slice(0, 50) + '.' + ext;
  return new File([buf], name, { type:(m.mime || 'audio/mp4').split(';')[0] });
}

// ---------- запись ----------
const session = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} };
const R = { on:false, busy:false, t0:0, peaks:[], level:0 };
export const recOn = () => R.on;
export const recState = () => ({ on:R.on, busy:R.busy, ms:R.on ? performance.now() - R.t0 : 0, level:R.level, peaks:R.peaks });
export const recSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
export async function startRec(){
  if (R.on || R.busy) return; R.busy = true; stopPlay();
  try {
    session('play-and-record');
    // без обработки «как в звонке»: она глушит протяжные ноты и прижимает громкость
    R.stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
    const mime = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const mr = R.mr = new MediaRecorder(R.stream, { ...(mime ? { mimeType:mime } : {}), audioBitsPerSecond:128000 }); R.chunks = []; R.peaks = []; R.level = 0;
    mr.ondataavailable = e => { if (e.data && e.data.size) R.chunks.push(e.data); };
    R.ended = new Promise(res => { mr.onstop = () => res(); mr.onerror = () => res(); });
    R.stream.getAudioTracks().forEach(tr => { tr.onended = () => { if (R.on && R.onauto) R.onauto(); }; });
    try { const C = window.AudioContext || window.webkitAudioContext; R.ctx = new C(); if (R.ctx.state === 'suspended') R.ctx.resume().catch(() => {}); R.an = R.ctx.createAnalyser(); R.an.fftSize = 1024; R.ctx.createMediaStreamSource(R.stream).connect(R.an); } catch (e) { R.an = null; }
    mr.start(); R.on = true; R.t0 = performance.now();
    const data = R.an ? new Uint8Array(R.an.fftSize) : null;
    R.timer = setInterval(() => { if (data) { R.an.getByteTimeDomainData(data); let m = 0; for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i] - 128)); R.level = Math.min(1, m / 90); R.peaks.push(Math.round(R.level * 100)); }
      if (performance.now() - R.t0 > 600000 && R.onauto) R.onauto(); }, 80);
    try { R.wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  } catch (e) { cleanRec(); throw e; } finally { R.busy = false; }
}
export const onRecAuto = f => { R.onauto = f; };
function cleanRec(){ clearInterval(R.timer); if (R.stream) R.stream.getTracks().forEach(t => { t.onended = null; t.stop(); }); try { R.ctx && R.ctx.close(); } catch (e) {} try { R.wake && R.wake.release(); } catch (e) {}
  R.on = false; R.stream = R.ctx = R.an = R.wake = null; session('playback'); } // иначе iPhone оставит звук в разговорном динамике
// заводит напев и сразу кладёт в память телефона; короче 0,4 с — случайное нажатие
export async function stopRec(extra = {}, keep = true){
  if (!R.on) return null; R.on = false; const dur = performance.now() - R.t0; clearInterval(R.timer);
  try { if (R.mr.state !== 'inactive') R.mr.stop(); await Promise.race([R.ended, new Promise(r => setTimeout(r, 4000))]); } finally { cleanRec(); }
  if (!keep || dur < 400 || !R.chunks.length) return null;
  const mime = R.mr.mimeType || R.chunks[0].type || 'audio/mp4', buf = await new Blob(R.chunks, { type:mime }).arrayBuffer(); R.chunks = [];
  const meta = { id:uid(), name:'', kind:'', dur:Math.round(dur), mime, size:buf.byteLength, peaks:squeeze(R.peaks, 64), created:Date.now(), ...extra };
  await putTake(meta, buf); return meta;
}
function squeeze(a, n){ if (!a.length) return []; if (a.length <= n) return a.slice(); const out = []; for (let i = 0; i < n; i++) { const s = Math.floor(i * a.length / n), e = Math.max(s + 1, Math.floor((i + 1) * a.length / n)); out.push(Math.max(...a.slice(s, e))); } return out; }

// ---------- проигрывание ----------
const P = { el:null, id:'', loop:false };
export const playing = () => P.id;
export const playPos = () => { const m = P.id && takeBy(P.id); return m && P.el ? Math.min(1, P.el.currentTime * 1000 / Math.max(1, m.dur)) : 0; };
// звук готовим заранее: iPhone разрешает включить его только прямо по нажатию
export async function warm(ids){ for (const id of ids.slice(0, 12)) { if (H.url.has(id)) continue; const m = takeBy(id), b = m && await bufOf(id).catch(() => null); if (b && !H.url.has(id)) H.url.set(id, URL.createObjectURL(new Blob([b], { type:m.mime.split(';')[0] }))); } }
function el(){ if (P.el) return P.el; const a = P.el = new Audio(); a.setAttribute('playsinline', ''); a.preload = 'auto';
  a.onended = () => { P.id = ''; H.onchange(); }; a.onpause = () => { if (!a.ended && P.id && !P.sw) { P.id = ''; H.onchange(); } }; a.onplaying = () => { P.sw = false; H.onchange(); }; return a; }
export async function togglePlay(id, loop){
  if (P.id === id) { stopPlay(); return; }
  if (R.on) return; const a = el(); P.sw = true; a.pause(); session('playback');
  if (!H.url.has(id)) await warm([id]); const u = H.url.get(id); if (!u) throw new Error('запись не найдена');
  P.id = id; a.src = u; a.loop = !!loop; H.onchange();
  try { await a.play(); } catch (e) { P.id = ''; P.sw = false; H.onchange(); throw e; }
}
export const setLoop = v => { if (P.el) P.el.loop = !!v; };
export function stopPlay(){ if (!P.id) return; P.id = ''; if (P.el) P.el.pause(); H.onchange(); }
export function seek(id, f){ const m = takeBy(id); if (m && P.id === id && P.el) P.el.currentTime = f * m.dur / 1000; }
