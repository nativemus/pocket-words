// «Строки» — версия 0.1. Всё хранится только на этом устройстве (IndexedDB).
import { stem, toks, headOf, hooksOf, bestHook, hookList, buildIndex, cardByHead, material, isSep, fragOf, plain } from './engine.js';
import { loadSenses, sensesReady, sensesOf, phrasesOf, senseCount } from './senses.js';
import { loadEndings, endingsReady, endings, frameOf, topicBlocks, assocOf, expand, phraseEnds } from './endings.js';
import { loadPunch, punchReady, punchStress, marked, punOf, turnsOf, candidates, leadWords } from './punch.js';
import { onHum, loadTakes, takes, takeBy, takesOf, putTake, dropTake, fileOf, startRec, stopRec, recOn, recState, recSupported, onRecAuto, playing, playPos, warm, togglePlay, setLoop, stopPlay, seek, beats } from './hum.js';
import { onBeat, beatState, beatPhase, beatPos, beatDur, stopBeat, startMetro, startBeat, holdBeat, wakeBeat, seekBeat, setBpm, setVol, setClick, setWood, WOODS, tap, tapReset } from './beat.js';
const VERSION = '2.0.1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const VOW = /[аеёиоуыэюя]/gi;
const syl = s => (String(s).match(VOW) || []).length;
const sl = n => { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return 'слог'; if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'слога'; return 'слогов'; };
const fmtDate = t => { const d = new Date(t), n = new Date(); const sameDay = d.toDateString() === n.toDateString();
  return sameDay ? 'сегодня ' + d.toTimeString().slice(0, 5) : d.toLocaleDateString('ru-RU', { day:'numeric', month:'short' }); };

// Общие вопросы «почему». Личные вопросы подгрузятся из личного файла (с версии 0.2).
const QUESTIONS = ['Где ты прямо сейчас?','Что ты видишь вокруг?','Что случилось перед этим?','Почему именно сейчас?','Кого здесь не хватает?',
  'Что ты чувствуешь телом?','Чем тут пахнет?','Что ты не сказал вслух?','Что будет дальше?','Кто бы это понял?','Как это выглядит со стороны?',
  'Что ты сделал бы по-другому?','Что у тебя в руках?','Какая сейчас погода?','Сколько времени на часах?','Что тебе мешает?','Ради кого это?',
  'Что ты потерял?','Что ты получил?','Что звучит в голове?','Какого это цвета?','Где ты был год назад?','Что сказал бы друг?','Почему это важно?'];
const AI = [{ name:'DeepSeek', url:'https://chat.deepseek.com/' }, { name:'Claude', url:'https://claude.ai/new' }];

// ---------- хранилище ----------
let db; const texts = new Map();
function openDB(){ return new Promise((res, rej) => { const r = indexedDB.open('strokes', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('texts', { keyPath:'id' }); r.result.createObjectStore('kv'); };
  r.onsuccess = () => { db = r.result; res(); }; r.onerror = () => rej(r.error); }); }
function loadAll(){ return new Promise(res => { const out = []; const c = db.transaction('texts').objectStore('texts').openCursor();
  c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); }; }); }
const timers = {};
// Сохраняем сразу: телефон может выгрузить приложение в любой момент.
function save(t){ t.updated = Date.now(); clearTimeout(timers[t.id]); delete timers[t.id]; putNow(t); }
function putNow(t){ try { db.transaction('texts', 'readwrite').objectStore('texts').put(JSON.parse(JSON.stringify(t))); } catch (e) { toast('Не сохранилось: ' + e.message); } }
function flushAll(){ Object.keys(timers).forEach(id => { clearTimeout(timers[id]); const t = texts.get(id); if (t) putNow(t); delete timers[id]; }); }
function delText(id){ texts.delete(id); db.transaction('texts', 'readwrite').objectStore('texts').delete(id); }
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
window.addEventListener('pagehide', flushAll);

function newText(init = {}){
  const t = { id: uid(), title: '', lines: [], thoughts: [], box: [], created: Date.now(), updated: Date.now(), ...init };
  texts.set(t.id, t); save(t); return t;
}
const titleOf = t => t.title || (t.lines.find(l => l.t) || {}).t || (t.thoughts[0] ? '💭 ' + t.thoughts[0] : 'Без названия');

// ---------- состояние ----------
const S = { tab:'write', view:'home', id:null, cur:0, edit:null, sheet:null, sd:{}, seg:'texts', back:'write', mode:'write' };
const T = () => texts.get(S.id);
const curLine = () => { const t = T(); return t ? t.lines[S.cur] : null; };

// ---------- отрисовка ----------
function render(){
  const tv = S.view === 'text' && T(); $('#app').className = tv ? 'tv tv-' + LOOK.text : '';
  renderTabs();
  if (tv) renderText(); else if (S.view === 'look') renderLook(); else if (S.tab === 'notes') renderNotes(); else if (S.tab === 'dict') renderDict();
  else if (S.tab === 'feed') renderFeed(); else renderHome();
  renderSheet();
}
function renderTabs(){
  const tabs = [['write','✎','Заметки'],['notes','☰','Блокнот'],['dict','Аа','Словарь'],['feed','☀','Лента дня']];
  $('#tabs').innerHTML = tabs.map(([k, i, n]) => '<button data-act="tab" data-v="' + k + '" class="' + (S.tab === k && S.view !== 'text' ? 'on' : '') + '"><i>' + i + '</i>' + n + '</button>').join('');
}
function hdr(left, title, right){ $('#hdr').innerHTML = (left || '<span class="a"></span>') + '<div class="t">' + title + '</div>' + (right || '<span class="a r"></span>'); }

function renderHome(){
  hdr('', 'Заметки', '');
  const recent = [...texts.values()].filter(t => !t.archived).sort((a, b) => b.updated - a.updated), last = recent.find(t => t.lines.some(l => l.t.trim())), rest = recent.filter(t => t !== last).slice(0, 4);
  let h = '<textarea id="home" class="askin" rows="1" enterkeyhint="done" placeholder="Слово, чувство или строка…">' + esc(S.homeV || '') + '</textarea><div class="homeacts" id="homeacts"></div>';
  if (last) { const ls = last.lines.filter(l => l.t.trim() && !goalOf(l)), line = (ls[ls.length - 1] || last.lines.find(l => l.t.trim())).t, st = D.ready ? stockFor(line, 4) : [];
    h += '<div class="grp">Остановился здесь</div><div class="last"><button class="lastb" data-act="open" data-v="' + last.id + '"><span class="k">' + esc(titleOf(last).slice(0, 40)) + ' · ' + fmtDate(last.updated) + '</span><span class="v">' + esc(line) + '</span></button>' +
      (st.length ? '<div class="k2">в запасе к этой строке</div><div class="chips">' + st.map(x => '<button class="chip rh" data-act="stockopen" data-v="' + esc(x.t) + '">' + esc(x.t.length > 34 ? x.t.slice(0, 33) + '…' : x.t) + '</button>').join('') + '</div>' : '') + '</div>'; }
  if (rest.length) h += '<div class="grp">Ещё тексты</div>' + rest.map(t => itemHTML(t)).join('');
  h += '<div class="grp">Запас' + (STOCK.length ? ' · ' + STOCK.length : '') + '</div>' + (STOCK.length ? '<div class="chips">' + STOCK.slice(0, 14).map(x => '<button class="chip rh" data-act="stockopen" data-v="' + esc(x.t) + '">' + esc(x.t.length > 30 ? x.t.split('\n')[0].slice(0, 29) + '…' : x.t) + '</button>').join('') + '</div>' + (STOCK.length > 14 ? '<button class="btn" style="margin-top:8px" data-act="allstock">весь запас</button>' : '') : '<div class="muted" style="margin:0 2px">Сюда складывай находки: слово из словаря, крючок, недописанный кусок. Когда подойдёт к строке — всплывёт само.</div>');
  $('#main').innerHTML = h; $('#tools').innerHTML = ''; bindRowSwipes();
  const inp = $('#home'), acts = () => { const v = inp.value.trim(), n = toks(v).length; inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; S.homeV = inp.value;
    $('#homeacts').innerHTML = !v ? '<button class="btn main" data-act="new">＋ Пустой лист</button><button class="btn" data-act="sheet" data-v="nothing">Ничего нет, дай слово</button><button class="btn" data-act="rec">' + MIC + 'Напеть</button>'
      : n <= 2 ? '<button class="btn main" data-act="homeword">Рифмы и слова</button><button class="btn" data-act="homeline">Начать строкой</button><button class="btn" data-act="homestock">В запас</button>'
      : '<button class="btn main" data-act="homeline">Начать строкой</button><button class="btn" data-act="homeword">Подобрать слова</button><button class="btn" data-act="homestock">В запас</button>'; };
  inp.addEventListener('input', acts); inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const b = document.querySelector('#homeacts .main'); if (b && inp.value.trim()) act(b.dataset.act, b.dataset.v, b); } }); acts();
}
// свайп влево по тексту: «В архив» / «Удалить» (в архиве — «Вернуть» / «Удалить»)
function itemHTML(t){ const n = t.lines.filter(l => l.t).length;
  return '<div class="swrow"><div class="swact">' + (t.archived ? '<button class="un" data-act="unarch" data-v="' + t.id + '">Вернуть</button>' : '<button class="ar" data-act="arch" data-v="' + t.id + '">В архив</button>') +
    '<button class="dl" data-act="sdel" data-v="' + t.id + '">Удалить</button></div>' +
    '<button class="item swi" data-act="open" data-v="' + t.id + '"><div class="h">' + esc(titleOf(t)) + '</div><div class="m">' + n + ' ' + (n === 1 ? 'строка' : n >= 2 && n <= 4 ? 'строки' : 'строк') + ' · ' + fmtDate(t.updated) + '</div></button></div>'; }
const SW_W = 172;
function closeRows(except){ document.querySelectorAll('.swrow.open').forEach(r => { if (r !== except) { r.classList.remove('open'); r.querySelector('.swi').style.transform = ''; } }); }
function bindRowSwipes(){
  document.querySelectorAll('.swrow .swi').forEach(it => { const row = it.parentElement; let x0, y0, dx = 0, mode = null, base = 0;
    it.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; dx = 0; mode = null; base = row.classList.contains('open') ? -SW_W : 0; });
    it.addEventListener('pointermove', e => { if (x0 === undefined) return; const mx = e.clientX - x0, my = e.clientY - y0;
      if (!mode) { if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { mode = 'h'; row.classList.add('dragging'); closeRows(row); try { it.setPointerCapture(e.pointerId); } catch (er) {} } else if (Math.abs(my) > 8) mode = 'v'; }
      if (mode === 'h') { dx = Math.max(-SW_W - 30, Math.min(0, base + mx)); it.style.transition = 'none'; it.style.transform = 'translateX(' + dx + 'px)'; } });
    const up = () => { if (mode === 'h') { it.style.transition = ''; const open = dx < -SW_W / 2; row.classList.toggle('open', open); it.style.transform = open ? 'translateX(' + -SW_W + 'px)' : '';
        it.dataset.drag = '1'; setTimeout(() => delete it.dataset.drag, 60); }
      row.classList.remove('dragging'); x0 = undefined; mode = null; };
    it.addEventListener('pointerup', up); it.addEventListener('pointercancel', up); });
}
let undoFn = null, undoT;
function toastUndo(text, fn){ const el = $('#toast'); undoFn = fn; el.innerHTML = esc(text) + ' <button data-act="undo">Вернуть</button>'; el.classList.add('on', 'undo');
  clearTimeout(undoT); clearTimeout(tt); undoT = setTimeout(() => { el.classList.remove('on', 'undo'); undoFn = null; }, 5000); }

function renderSoon(title, text){ hdr('', title, ''); $('#main').innerHTML = '<div class="soon">' + text + '</div>'; $('#tools').innerHTML = ''; }

function renderNotes(){
  hdr('', 'Блокнот', '<button class="a r" data-act="new">＋ новый</button>');
  const every = [...texts.values()].sort((a, b) => b.updated - a.updated), all = every.filter(t => !t.archived);
  const single = t => t.lines.filter(l => l.t).length === 1 && !t.thoughts.length;
  let body = '<div class="seg">' + [['texts','Тексты'],['starts','Начала'],['good','Годное'],['hums','Напевы'],['stock','Запас'],['arch','Архив']].map(([k, n]) => '<button data-act="seg" data-v="' + k + '" class="' + (S.seg === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>';
  if (S.seg === 'texts') { const l = all.filter(t => !single(t)); body += '<div class="muted" style="margin:0 2px 8px">Свайп влево по тексту — в архив или удалить.</div>' + (l.length ? l.map(t => itemHTML(t)).join('') : '<div class="empty">Текстов пока нет</div>'); }
  else if (S.seg === 'arch') { const l = every.filter(t => t.archived); body += '<div class="muted" style="margin:0 2px 8px">Убранные тексты. Свайп влево — вернуть или удалить насовсем.</div>' + (l.length ? l.map(t => itemHTML(t)).join('') : '<div class="empty">Архив пуст</div>'); }
  else if (S.seg === 'starts') { const l = all.filter(single); body += '<div class="muted" style="margin:0 2px 8px">Одиночные строки: то, что записал и ещё не продолжил.</div>' + (l.length ? l.map(t => itemHTML(t)).join('') : '<div class="empty">Начал пока нет</div>'); }
  else if (S.seg === 'hums') body += humsHTML() + beatsHTML();
  else if (S.seg === 'stock') { body += '<div class="muted" style="margin:0 2px 8px">Находки на потом. Всплывают сами, когда подходят к строке.</div>' + (STOCK.length ? STOCK.map(x => '<button class="item" data-act="stockopen" data-v="' + esc(x.t) + '"><div class="h" style="white-space:pre-line">' + esc(x.t.length > 120 ? x.t.slice(0, 118) + '…' : x.t) + '</div><div class="m">' + esc(x.src || '') + '</div></button>').join('') : '<div class="empty">Запас пуст</div>'); }
  else { const g = []; all.forEach(t => t.lines.forEach((l, i) => { if (l.star && l.t) g.push([t, l, i]); }));
    body += '<div class="muted" style="margin:0 2px 8px">Строки, которые ты отметил ★.</div>' + (g.length ? g.map(([t, l, i]) => '<button class="item" data-act="open" data-v="' + t.id + '" data-i="' + i + '"><div class="h">★ ' + esc(l.t) + '</div><div class="m">' + esc(titleOf(t)) + '</div></button>').join('') : '<div class="empty">Пока ничего не отмечено</div>'); }
  body += '<div class="grp">Вид</div><button class="item" data-act="look"><div class="h">Внешний вид</div><div class="m">обои, затемнение, экран текста</div></button>' +
    '<div class="grp">Копия</div><div class="muted" style="margin:0 2px 8px">Тексты живут только в этом телефоне. Сохраняй копию в «Файлы» — на случай потери телефона и чтобы перенести на ноутбук.</div>' +
    '<div class="row"><button class="btn" data-act="export">Сохранить копию</button><button class="btn" data-act="import">Загрузить копию</button></div>' +
    '<div class="muted" style="margin:18px 2px 0;text-align:center">Версия ' + VERSION + '<br>Ударения: словарь Козиева (CC0). Частотность слов для рифм: FrequencyWords, OpenSubtitles (CC BY-SA 4.0). Английское произношение: CMU Pronouncing Dictionary, © 1993–2015 Carnegie Mellon University (BSD). Толкования и выражения: Викисловарь (CC BY-SA 4.0). Частые продолжения: OpenSubtitles, OPUS.</div>';
  $('#main').innerHTML = body; $('#tools').innerHTML = ''; bindRowSwipes();
}

// --- ритм над строкой ---
function longFlags(taps){ const d = taps.map(x => x[1]).sort((a, b) => a - b); const med = d[Math.floor(d.length / 2)] || 0; return taps.map(x => x[1] > Math.max(260, med * 1.8)); }
function syllables(s){ const V = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ', out = []; let cur = '';
  for (const ch of s) { if (/[\s,.!?—–-]/.test(ch)) { if (cur.trim() === '') cur += ch; else { if (out.length) out[out.length - 1] += cur; else out.push(cur); cur = ch; } continue; }
    cur += ch; if (V.includes(ch)) { out.push(cur); cur = ''; } }
  if (cur) { if (out.length) out[out.length - 1] += cur; else out.push(cur); } return out; }
function lineHTML(l){
  if (!l.taps || !l.t) return '<span class="plain">' + esc(l.t) + '</span>';
  const n = l.taps.length, lf = longFlags(l.taps), st = l.strong || [], sy = syllables(l.t);
  if (sy.length === n) return sy.map((c, i) => { const m = c.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return esc(m[1]) + '<span class="sy1"><span class="mk' + (lf[i] ? ' long' : '') + (st.includes(i) ? ' str' : '') + '"></span>' + esc(m[2]) + '</span>' + esc(m[3]); }).join('');
  const t0 = l.taps[0][0], end = l.taps[n - 1][0] + l.taps[n - 1][1], span = Math.max(end - t0, 1);
  return '<div class="rtrack">' + l.taps.map((x, i) => '<span class="' + (st.includes(i) ? 'str' : '') + '" style="left:' + ((x[0] - t0) / span * 94) + '%;width:' + (lf[i] ? Math.max(10, x[1] / span * 100) + '%' : '5px') + '"></span>').join('') + '</div>' + esc(l.t);
}

// номер строки считаем только по непустым: пустая строка — это пробел между куплетами
const numOf = (t, i) => t.lines.slice(0, i + 1).filter(l => l.t).length;
const isGoal = s => /^…\s*\S/.test(s || '');
// строка-цель: рифма, которой должна закончиться строка; пока в строке только это слово
const goalOf = l => !l ? '' : (l.goal && l.t.trim() === l.goal) ? l.goal : isGoal(l.t) ? l.t.replace(/^…\s*/, '') : '';
// сплошной текст → строки; ритм, ★ и счёт сохраняются у строк, текст которых не изменился
function syncFromText(t, value){
  const old = t.lines.slice(), used = new Set();
  t.lines = value.split('\n').map(x => { const k = old.findIndex((l, j) => !used.has(j) && l.t === x);
    if (k >= 0) { used.add(k); return old[k]; } return { t:x, strong:[] }; });
  while (t.lines.length > 1 && t.lines[t.lines.length - 1].t === '' && !value.endsWith('\n')) t.lines.pop();
}
function caretLine(ta){ return ta.value.slice(0, ta.selectionStart).split('\n').length - 1; }
function autosize(ta){ ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 240) + 'px'; }

function renderText(){
  const t = T();
  hdr('<button class="a" data-act="back">‹ Назад</button>', '<input id="title" placeholder="' + esc(titleOf(t)) + '" value="' + esc(t.title) + '">', '<span class="a r hr2"><button data-act="rec" aria-label="Напеть">' + MIC + '</button><button data-act="sheet" data-v="menu">⋯</button></span>');
  let h = beatBar(t) + humRow(t) + (S.timerEnd && S.timerId === t.id ? '<button class="timer" id="timer" data-act="timerstop">⏱ 10:00</button>' : '');
  t.thoughts.forEach((x, i) => h += '<div class="thought"><div style="flex:1"><b>мысль</b>' + esc(x) + '</div><button class="x" data-act="rmthought" data-v="' + i + '">×</button></div>');
  if (t.box.length) h += '<div class="box"><span class="lbl">ящик:</span>' + t.box.map((x, i) => '<span class="chip"><button class="bx" data-act="boxins" data-v="' + i + '">' + esc(x) + '</button><button data-act="rmbox" data-v="' + i + '">×</button></span>').join('') + '<button class="chip" data-act="boxstock">всё в запас</button></div>';
  h += '<div class="ed"><div id="gut"></div><div id="mir" class="notes" aria-hidden="true"></div><textarea id="ta" class="notes" autocapitalize="sentences" placeholder="Пиши как в заметках. Три Enter — новая мысль.">' + esc(t.lines.map(l => l.t).join('\n')) + '</textarea></div>';
  $('#main').innerHTML = h;
  renderTools();
  const ta = $('#ta');
  if (ta) { drawMirror(); autosize(ta);
    const upd = () => { const i = caretLine(ta); if (i !== S.cur) { S.cur = i; renderTools(); gutCur(); } };
    ta.addEventListener('input', () => { syncFromText(t, ta.value); save(t); drawMirror(); autosize(ta); S.cur = caretLine(ta); renderTools(); gutCur(); keepCaret(); });
    ['keyup', 'click', 'select', 'focus'].forEach(ev => ta.addEventListener(ev, upd));
    if (S.focusTA) { S.focusTA = false; ta.focus(); const pos = S.caret ?? ta.value.length; ta.setSelectionRange(pos, pos); S.caret = null; S.cur = caretLine(ta); renderTools(); gutCur(); keepCaret(); } }
  const ed = $('#ed'); if (ed) { ed.focus(); const v = ed.value; ed.setSelectionRange(v.length, v.length);
    ed.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(true); } });
    ed.addEventListener('blur', () => setTimeout(() => { if (S.edit !== null && document.activeElement !== $('#ed')) saveEdit(false); }, 120)); }
  $('#title').addEventListener('input', e => { t.title = e.target.value; save(t); });
}
// зеркало под полем: рисует разделители между мыслями, сам текст остаётся чистым
function drawMirror(){ const m = $('#mir'), t = T(); if (!m || !t) return;
  const L = $('#ta').value.split('\n').map(x => ({ t:x })); const FR = [], tw = t.tagOn || '', tf = t.tagFrag || 0;
  const TG = { sig:i => TG.forLine(i).map(x => x.k + x.w).join(), forLine:i => { const [a, b] = fragOf(L, i); const key = a; if (!FR[key]) { const g = autoTags(L.slice(a, b + 1).map(x => x.t)); FR[key] = tw && R.ready && fragNo(L, a) === tf ? withTarget(g, tw) : g; } return FR[key]; } };
  const rk = i => { const l = t.lines[i]; return l && l.taps ? '|' + l.taps.length + (l.strong || []).join() : ''; };
  L.forEach((l, i) => { let d = m.children[i]; if (!d) { d = document.createElement('div'); m.appendChild(d); } if (d.dataset.t !== l.t + '|' + TG.sig(i) + rk(i)) { d.dataset.t = l.t + '|' + TG.sig(i) + rk(i); const tg = TG.forLine(i), tl = t.lines[i], rl = tl && tl.taps && tl.t === l.t ? '<div class="rl">' + lineHTML(tl) + '</div>' : ''; if (tg.length || rl || l.t.search(LONG) >= 0) d.innerHTML = markLine(l.t, tg) + rl; else d.textContent = l.t; } d.className = isSep(L, i) ? 'sep' : ''; });
  while (m.children.length > L.length) m.lastChild.remove();
  const hints = fragHints(L); [...m.children].forEach((d, i) => { const h = hints.get(i + 1) || ''; if ((d.dataset.hint || '') !== h) { if (h) d.dataset.hint = h; else delete d.dataset.hint; } });
  matchMirror(m, $('#ta')); drawGutter(t, m); }
// слева от строки — сколько в ней слогов; у разделителя — меню куска
const lineSyl = s => (String(s).match(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*|[A-Za-z][A-Za-z'’]*/g) || []).reduce((n, raw) => { hintOf(raw); const w = plain(raw.toLowerCase().replace(/’/g, "'")); return n + (isLat(w) ? (R.ready ? sylS(soundOf(w).s) : 0) : syl(w)); }, 0);
function drawGutter(t, m){ const g = $('#gut'); if (!g) return; let h = '';
  [...m.children].forEach((d, i) => { const l = t.lines[i]; const top = d.offsetTop;
    if (d.className === 'sep') { h += '<button class="gs" style="top:' + (top - 4) + 'px" data-act="fragat" data-v="' + (i + 1) + '">⋯</button>'; return; }
    if (!l || !l.t.trim()) return; const n = l.ry ? l.ry + '♪' : goalOf(l) ? '·' : lineSyl(l.t);
    h += '<button class="gn' + (l.star ? ' st' : '') + (i === S.cur ? ' cur' : '') + '" data-i="' + i + '" style="top:' + top + 'px" data-act="lineact" data-v="' + i + '">' + (l.star ? '★' : '') + n + '</button>'; });
  g.innerHTML = h; }
function gutCur(){ document.querySelectorAll('#gut .gn').forEach(b => b.classList.toggle('cur', +b.dataset.i === S.cur)); }
// ---------- куски ----------
function splitFrags(lines){ const pieces = [], gaps = []; let cur = [], i = 0; const e = l => !l.t.trim();
  while (i < lines.length && e(lines[i])) i++;
  while (i < lines.length) { if (!e(lines[i])) { cur.push(lines[i++]); continue; } let n = 0, j = i; while (j < lines.length && e(lines[j])) { n++; j++; }
    if (j >= lines.length) break; if (n >= 2) { pieces.push(cur); gaps.push(n); cur = []; } else cur.push(lines[i]); i = j; }
  if (cur.length) pieces.push(cur); return { pieces, gaps }; }
const joinFrags = (pieces, gaps) => pieces.flatMap((p, k) => k ? Array.from({ length:gaps[k - 1] || 3 }, () => ({ t:'', strong:[] })).concat(p) : p);
const endsOf = p => p.map(l => lastWordOf(l.t)).filter(w => w && w.length > 2 && !STOPW.has(w)).map(w => ({ w, ...tagSound(w) }));
// точная рифма между концами строк разных кусков
function fragLink(pieces, k){ if (!R.ready || !pieces[k]) return null; const a = endsOf(pieces[k]); for (let j = pieces.length - 1; j >= 0; j--) { if (j === k) continue; for (const y of endsOf(pieces[j])) for (const x of a) if (x.tl === y.tl && x.tl.length > 1 && stem(x.w) !== stem(y.w)) return { j, mine:x.w, other:y.w }; } return null; }
function fragHints(L){ const out = new Map(); if (!R.ready) return out; const { pieces } = splitFrags(L); if (pieces.length < 2) return out; let k = 0;
  L.forEach((l, i) => { if (!isSep(L, i) || i === L.length - 1) return; k++; const p = fragLink(pieces.slice(0, k + 1), k); if (p && p.j < k) out.set(i, '«' + p.mine + '» рифмуется с «' + p.other + '» выше'); }); return out; }
const pieceAt = (lines, i) => { let k = 0; for (let j = 0; j < i; j++) if (isSep(lines, j)) k++; return k; };
function setFrags(t, pieces, gaps, k){ t.lines = joinFrags(pieces, gaps); if (!t.lines.length) t.lines = [{ t:'', strong:[] }]; let at = 0; for (let j = 0; j < k; j++) at += pieces[j].length + (gaps[j] || 3); S.cur = Math.min(at, t.lines.length - 1); save(t); S.sheet = null; S.sd = {}; S.refocus = false; render(); }
// ---------- запас: находки на потом ----------
let STOCK = []; const saveStock = () => kvSet('stock', STOCK);
function addStock(x, src){ x = String(x || '').trim(); if (!x) return false; if (STOCK.some(y => y.t === x)) return false; STOCK.unshift({ t:x, src:src || '', at:Date.now() }); saveStock(); return true; }
// что из запаса и избранного подходит к строке: по теме или по рифме
function stockFor(line, n){ if (!D.ready || !line.trim()) return []; const direct = new Set(toks(expand(line)).filter(w => w.length > 2 && !STOPW.has(w)).map(stem)), near = new Set(endingsReady() ? toks(line).filter(w => w.length > 3 && !STOPW.has(w)).flatMap(w => assocOf(w).slice(0, 8)).map(stem) : []);
  const rw = R.ready ? lastWordOf(line) : '', g = rw ? tagSound(rw) : null, have = new Set(toks(line).map(stem));
  const pool = STOCK.map(x => ({ t:x.t })).concat([...D.fav].map(id => D.cards[D.byId.get(id)]).filter(Boolean).map(c => ({ t:insertForm(c), extra:bestHook(c) })));
  return pool.map(x => { const ws = toks(x.t + ' ' + (x.extra || '')).map(stem); let sc = 0; ws.forEach(w => { if (direct.has(w)) sc += 2; else if (near.has(w)) sc += 1; }); const lw = lastWordOf(x.t); if (g && lw && !have.has(stem(lw))) { const y = tagSound(lw), k = rhymeKind(g.tl, g.sk, y.tl, true); if (k) { sc += k === 2 ? 2 : 1.5; x.rh = true; } } if (toks(x.t).length === 1 && have.has(stem(x.t))) sc = 0; return { ...x, sc }; }).filter(x => x.sc >= 1.5).sort((a, b) => b.sc - a.sc).slice(0, n); }
// зеркало обязано переносить строки ровно как поле: сверяем высоту и подбираем отступ; не сошлось — линии не показываем, чтобы не легли на текст
let MIR_PAD = 2;
function matchMirror(m, ta){ if (!m.querySelector('.sep,u,s')) return;
  const oh = ta.style.height, om = ta.style.minHeight; ta.style.minHeight = '0'; ta.style.height = '0'; const need = ta.scrollHeight; ta.style.height = oh; ta.style.minHeight = om;
  const own = () => m.lastElementChild.offsetTop + m.lastElementChild.offsetHeight - m.firstElementChild.offsetTop + 8, ok = () => Math.abs(own() - need) < 12;
  const set = x => { m.style.paddingLeft = m.style.paddingRight = x + 'px'; };
  set(MIR_PAD); if (!ok()) { const hit = [2, 5, 1, 3, 4, 0, 6, 7, 8].find(x => { set(x); return ok(); }); if (hit !== undefined) MIR_PAD = hit; else set(2); }
  m.classList.toggle('off', !ok()); }
// строка с курсором не должна уезжать под клавиатуру
function keepCaret(){ const m = $('#mir'), main = $('#main'); if (!m || !main) return; const d = m.children[S.cur]; if (!d) return;
  const r = d.getBoundingClientRect(), v = main.getBoundingClientRect(); if (r.bottom > v.bottom - 12) main.scrollTop += r.bottom - v.bottom + 24; else if (r.top < v.top + 8) main.scrollTop -= v.top - r.top + 24; }
const ICO = {
  mat:'<svg viewBox="0 0 24 24"><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" fill="currentColor" stroke="none"/></svg>',
  rh:'<svg viewBox="0 0 24 24"><path d="M4 9c2.7-3 5.3-3 8 0s5.3 3 8 0M4 16c2.7-3 5.3-3 8 0s5.3 3 8 0"/></svg>',
  zh:'<svg viewBox="0 0 24 24"><path d="M5 5v14M10 12h9M15.5 8l4 4-4 4"/></svg>',
  end:'<svg viewBox="0 0 24 24"><path d="M4 12h9M9.5 8l4 4-4 4M19 5v14"/></svg>',
  punch:'<svg viewBox="0 0 24 24"><path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z"/></svg>',
  why:'<svg viewBox="0 0 24 24"><path d="M8.5 9a3.5 3.5 0 1 1 5.2 3.1c-1.2.7-1.7 1.3-1.7 2.6M12 18.6v.1"/></svg>',
  more:'<svg viewBox="0 0 24 24"><path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3.4"/></svg>' };
const tile = (k, n, act, main, off) => '<button class="tile' + (main ? ' main' : '') + '" data-act="sheet" data-v="' + act + '"' + (off ? ' disabled' : '') + '>' + ICO[k] + '<span>' + n + '</span></button>';
// строка, к которой ищем: текущая, а если она пустая — предыдущая в том же куске
function baseLine(t){ const L = t.lines, i = Math.min(S.cur, L.length - 1); if (i < 0) return null; if (L[i].t.trim() && !goalOf(L[i])) return L[i];
  const [a] = fragOf(L, i); for (let j = i - 1; j >= a; j--) if (L[j].t.trim() && !goalOf(L[j])) return L[j]; return null; }
function renderTools(){
  const t = T(); if (!t) return; const cl = curLine(), begun = !!(cl && cl.t.trim() && !goalOf(cl)), sig = [S.id, begun, !!baseLine(t)].join();
  if ($('#strip') && TOOLS_SIG === sig) { scheduleStrip(); return; } TOOLS_SIG = sig;
  $('#tools').innerHTML = '<div class="strip tagbar" id="tagbar" style="display:none"></div><div class="strip" id="strip"></div><div class="tools"><div class="five">' +
    tile('mat', 'Материал', 'mat', true) + tile('rh', 'Рифма', 'rhyme', false, !baseLine(t)) + (begun ? tile('end', 'Концовка', 'end') : tile('zh', 'Заход', 'zahod')) + tile('punch', 'Панч', 'punch') + tile('more', 'Ещё', 'more') + '</div></div>';
  drawStrip();
}
// ---------- метки рифм: А, Б, В, Г ----------
const TAGK = ['А', 'Б', 'В', 'Г'];
const fragNo = (L, i) => { let n = 0; for (let j = 0; j < i; j++) if (isSep(L, j)) n++; return n; };
function fragText(t){ if (!t.lines.length) return ''; const [a, b] = fragOf(t.lines, Math.min(S.cur, t.lines.length - 1)); return t.lines.slice(a, b + 1).map(l => l.t).join('\n'); }
// группы рифм куска находятся сами (А, Б, В, Г); выбранное слово — к нему идут подсказки; цвета от выбора не меняются
const targetHere = t => { if (!t.tagOn || !t.lines.length) return ''; return (t.tagFrag || 0) === fragNo(t.lines, Math.min(S.cur, t.lines.length - 1)) ? t.tagOn : ''; };
function withTarget(groups, w){ if (!w) return groups; const g = tagSound(w); const home = groups.find(x => x.w === w) || groups.find(x => rhymeKind(x.tl, x.sk, g.tl, false) === 2) || groups.find(x => rhymeKind(x.tl, x.sk, g.tl, false) === 1);
  if (home) return groups.map(x => x === home ? { ...x, on:true } : x); const n = Math.min(groups.length, 3); return groups.concat({ k:TAGK[n], n, w, ...g, on:true, own:true }); }
function tagsHere(t){ if (!R.ready || !t.lines.length) return []; const [a, b] = fragOf(t.lines, Math.min(S.cur, t.lines.length - 1)); return withTarget(autoTags(t.lines.slice(a, b + 1).map(l => l.t)), targetHere(t)); }
function activeTag(t){ const w = targetHere(t); return w ? { w } : null; }
function setTarget(t, w){ const cur = targetHere(t); t.tagOn = cur === w ? '' : w; t.tagFrag = t.lines.length ? fragNo(t.lines, Math.min(S.cur, t.lines.length - 1)) : 0; putNow(t); }
function rhymeKind(tl, sk, x, inner){ if (x === tl) return 2; const s2 = skelOf(x); if (!tl || s2 !== sk) return 0; const lk = likeness(tl, x), m = Math.min(tl.length, x.length); if (m < 2) return 0; return inner ? (m > 2 && lk >= 2 * m - 1 ? 1 : 0) : (sk.length > 1 || lk >= 2 * m - 2 ? 1 : 0); }
const tagSound = w => { const so = soundOf(w), tl = tail(so.s, so.si); return { tl, sk:skelOf(tl) }; };
// какие слова строки к какой метке: для подчёркивания в тексте
const LONG = /([аеёиоуыэюяaeiouy])(?:-+\1)+|([а-яёa-z])\2{2,}/gi;
const longHTML = raw => { let out = '', at = 0; for (const m of raw.matchAll(LONG)) { out += esc(raw.slice(at, m.index)) + '<s class="lg">' + esc(m[0]) + '</s>'; at = m.index + m[0].length; } return out + esc(raw.slice(at)); };
// чистый текст: без растяжек и без ударений заглавной
const cleanText = s => String(s).replace(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g, w => { const p = plain(w); return p.length > 1 && p !== p.toUpperCase() ? p[0] + p.slice(1).toLowerCase() : p; });
function markLine(text, tags){
  const re = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*|[A-Za-z][A-Za-z'’]*/g; let m, out = '', at = 0; const all = [...text.matchAll(re)];
  all.forEach((mm, k) => { const raw = mm[0], w = plain(raw.toLowerCase().replace(/’/g, "'")), inner = k < all.length - 1 && !/^\s*[,.;:!?…—–)]/.test(text.slice(mm.index + raw.length)); let cls = '';
    if (w.length > 1) { hintOf(raw); for (const g of tags) { if (g.w === w) { cls = 'u' + g.n + ' ux'; break; } }
      if (!cls && (w.length > 2 || !inner) && !(inner && STOPW.has(w))) { const so = soundOf(w); if (so.src !== 'guess' || !inner) { const x = tail(so.s, so.si); let best = 0; for (const g of tags) { const r = rhymeKind(g.tl, g.sk, x, inner); if (r > best) { best = r; cls = 'u' + g.n + (r === 2 ? ' ux' : ' un'); } } } } }
    out += esc(text.slice(at, mm.index)) + (cls ? '<u class="' + cls + '">' + longHTML(raw) + '</u>' : longHTML(raw)); at = mm.index + raw.length; });
  return out + esc(text.slice(at)); }
// без меток: сами находим, какие концы строк (и слова перед запятой) рифмуются между собой
function autoTags(lines){
  if (!R.ready) return []; const ends = [];
  lines.forEach(text => { const all = [...text.matchAll(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*|[A-Za-z][A-Za-z'’]*/g)]; all.forEach((mm, k) => { const raw = mm[0]; if (k < all.length - 1 && !/^\s*[,.;:!?…—–)]/.test(text.slice(mm.index + raw.length))) return;
    const w = plain(raw.toLowerCase().replace(/’/g, "'")); if (w.length < 2 || (k < all.length - 1 && STOPW.has(w))) return; hintOf(raw); ends.push({ w, ...tagSound(w) }); }); });
  const groups = [], taken = new Set(), pass = need => ends.forEach((e, i) => { if (taken.has(i) || groups.length >= 4) return; const mem = ends.map((x, j) => j).filter(j => j !== i && !taken.has(j) && (ends[j].w !== e.w ? rhymeKind(e.tl, e.sk, ends[j].tl, false) >= need : need === 2)); if (!mem.length) return; [i, ...mem].forEach(j => taken.add(j)); groups.push(e); });
  pass(2); pass(1);
  return groups.map(e => ({ e, at:ends.indexOf(e) })).sort((a, b) => a.at - b.at).map((g, n) => ({ k:TAGK[n], n, w:g.e.w, tl:g.e.tl, sk:g.e.sk, auto:true })); }
let TOOLS_SIG = ''; let stripT; const STRIP = { key:'', items:[] };
function scheduleStrip(){ clearTimeout(stripT); stripT = setTimeout(drawStrip, 220); }
function stripData(t){
  const L = t.lines, i = Math.min(S.cur, L.length - 1), cur = i >= 0 ? L[i].t : '', [a, b] = i >= 0 ? fragOf(L, i) : [0, -1];
  let prev = null; for (let j = i - 1; j >= a; j--) if (L[j].t.trim() && !goalOf(L[j])) { prev = L[j]; break; }
  const empty = !cur.trim(), open = !empty && endingsReady() && frameOf(cur).kind !== 'open', target = prev || (empty || open ? null : L[i]);
  const about = L.slice(a, b + 1).map(x => x.t).join(' ') || t.thoughts.join(' ');
  const out = [], seen = new Set(toks(about));
  const cards = D.ready && about.trim() ? material(expand(about), 14).filter(x => !seen.has(headOf(D.cards[x.i].word).toLowerCase())) : [];
  const used = new Set([...seen].map(stem)); const push = (w, kind, ci) => { const k = w.toLowerCase(), one = toks(w); if (!w || seen.has(k) || (kind !== 'z' && one.length === 1 && used.has(stem(k)))) return; seen.add(k); out.push({ w, kind, ci }); };
  const dict = x => push(insertForm(D.cards[x.i]), 'd', x.i);
  if (!empty && endingsReady() && sensesReady()) { const f = frameOf(cur); if (f.kind !== 'open') endings(cur, 1 + cur.length).expr.slice(0, 2).forEach(x => push(x.t, 'd', null)); }
  if (!activeTag(t) && about.trim()) stockFor(empty && prev ? prev.t : cur || about, 2).forEach(x => { if (x.t.length < 60 && !x.t.includes('\n')) push(x.t, 's', null); });
  if (!activeTag(t)) cards.slice(0, 2).forEach(dict);
  let word = ''; const tg = R.ready ? activeTag(t) : null;
  if ((target || tg) && R.ready) { word = tg ? tg.w : lastWordOf(target.t); if (word) { const so = soundOf(word);
    const mean = rhymeMeaning(so, word, about).slice(0, 4); mean.forEach(x => push(x.w, 'rd', x.ci));
    const r = findRhymes(so.s, so.si, isLat(word)); r.exact.slice(0, 10).concat(r.near.slice(0, 8)).forEach(w => push(w, 'r', cardByHead(w)));
    if (isLat(word)) findEng(so.s, so.si, word).exact.slice(0, 6).forEach(x => push(x.w, 'r', null)); } }
  cards.slice(2, 8).forEach(dict);
  if (!out.length && D.ready) zahodStarts().forEach(w => push(w, 'z', null));
  return { word: tg || empty || prev ? word : '', items:out };
}
let ZS = null; function zahodStarts(){ if (!ZS) ZS = D.cards.filter(c => c.b === 40 && !(D.zseen || {})[c.word]).map(c => c.word).sort(() => Math.random() - .5).slice(0, 14); return ZS; }
const NAMES = new Set([1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 21, 22, 23, 24, 25, 27]);
const insertForm = c => { const h = headOf(c.word); return /^[А-ЯЁ][а-яё-]+( [а-яё-]+)*$/.test(h) && !NAMES.has(c.b) ? h.toLowerCase() : h; };
function drawStrip(){ const el = $('#strip'), t = T(); if (!el || !t) return; const d = stripData(t); STRIP.items = d.items;
  const here = tagsHere(t), on = activeTag(t), tb = $('#tagbar'), bar = here.length || on;
  if (tb) { tb.innerHTML = bar ? here.map(x => '<button class="tag t' + x.n + (x.on ? ' on' : '') + '" data-act="tagon" data-v="' + esc(x.on ? on.w : x.w) + '"><b>' + x.k + '</b>' + esc(x.on ? on.w : x.w) + (x.on ? ' <b>×</b>' : '') + '</button>').join('') + '<button class="tag plus" data-act="tags">другое слово ✎</button>' : ''; tb.style.display = bar ? '' : 'none'; }
  el.innerHTML = (bar ? '' : d.word ? '<button class="tag auto on" data-act="tags">к «' + esc(d.word) + '» ✎</button>' : t.lines.some(l => l.t.trim()) ? '<button class="tag auto" data-act="tags">рифма к… ✎</button>' : '') + d.items.map((x, k) => '<button class="sug' + (x.kind === 'd' || x.kind === 'rd' ? ' d' : x.kind === 's' ? ' s' : '') + (x.ci !== null && x.ci !== undefined ? ' has' : '') + '" data-act="sug" data-v="' + k + '" data-hold="' + (x.ci !== null && x.ci !== undefined ? D.cards[x.ci].id : '') + '" data-w="' + esc(x.w) + '">' + esc(x.w) + '</button>').join('');
  el.style.display = d.items.length ? '' : 'none'; }
// вставка слова туда, где курсор; рифма на пустой строке встаёт концом, курсор — перед ней
function insertWord(w, asEnd){
  const t = T(), ta = $('#ta'); if (!t) return;
  if (!ta) { const l = t.lines[S.cur]; if (l) { l.t = (l.t ? l.t.replace(/\s+$/, '') + ' ' : '') + w; } else t.lines.push({ t:w, strong:[] }); save(t); render(); return; }
  const pos = ta.selectionStart ?? ta.value.length, v = ta.value, i = v.slice(0, pos).split('\n').length - 1, empty = !v.split('\n')[i].trim();
  let nv, np;
  if (asEnd && empty) { const ls = v.slice(0, pos).lastIndexOf('\n') + 1, le = (v.indexOf('\n', pos) + 1 || v.length + 1) - 1; nv = v.slice(0, ls) + ' ' + w + v.slice(le); np = ls; }
  else { const sp = pos > 0 && !/\s/.test(v[pos - 1]) ? ' ' : '', after = v[pos] && !/\s/.test(v[pos]) ? ' ' : ''; nv = v.slice(0, pos) + sp + w + after + v.slice(pos); np = pos + sp.length + w.length; }
  ta.value = nv; syncFromText(t, nv); S.cur = nv.slice(0, np).split('\n').length - 1;
  if (asEnd && empty && t.lines[S.cur]) t.lines[S.cur].goal = w;
  save(t); ta.setSelectionRange(np, np); drawMirror(); autosize(ta); renderTools(); keepCaret();
}
// tools не должны уводить фокус из поля, пока не нужно
document.addEventListener('pointerdown', e => { if (e.target.closest('#tools button') && document.activeElement === $('#ta')) { S.caret = $('#ta').selectionStart; S.refocus = true; } });
// тап по полоске не прячет клавиатуру
['mousedown', 'touchend'].forEach(ev => document.addEventListener(ev, e => { const b = e.target.closest && e.target.closest('#strip .sug, #tagbar .tag:not(.plus)'); if (b && document.activeElement === $('#ta')) { if (ev === 'mousedown') e.preventDefault(); } }, { passive:false }));
function saveEdit(next){
  const t = T(); if (!t || S.edit === null) return; const i = S.edit, l = t.lines[i]; const ed = $('#ed'); if (!ed) { S.edit = null; return; }
  const v = ed.value.trim();
  if (v !== l.t) { l.t = v; l.taps = null; l.strong = []; l.ry = null; }
  S.edit = null;
  if (!v && t.lines.length > 0 && !next) { t.lines.splice(i, 1); S.cur = Math.max(0, Math.min(S.cur, t.lines.length - 1)); }
  else if (next && v) { t.lines.splice(i + 1, 0, { t:'', strong:[] }); S.cur = i + 1; S.edit = i + 1; }
  save(t); render();
}

// ---------- клавиатура: приложение сжимается до видимой части, панель и полоска всегда над ней ----------
function fitKeyboard(){ const vv = window.visualViewport; if (!vv) return; const app = $('#app'); let full = window.innerHeight;
  const fit = () => { full = Math.max(full, window.innerHeight); const ae = document.activeElement, typing = ae && /^(TEXTAREA|INPUT)$/.test(ae.tagName) && ae.type !== 'range' && ae.type !== 'file', kb = typing && full - vv.height > 140;
    app.classList.toggle('kb', !!kb);
    if (kb) { app.style.height = vv.height + 'px'; app.style.position = 'fixed'; app.style.left = '0'; app.style.right = '0'; app.style.top = vv.offsetTop + 'px'; if (ae.id === 'ta') keepCaret(); }
    else { app.style.height = ''; app.style.position = ''; app.style.top = ''; app.style.left = ''; app.style.right = ''; } };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); window.addEventListener('orientationchange', () => { full = 0; setTimeout(fit, 400); });
  document.addEventListener('focusin', () => setTimeout(fit, 60)); document.addEventListener('focusout', () => setTimeout(fit, 120)); }

// ---------- панч: слова к строке ----------
const keepScroll = f => { const sb = document.querySelector('.sheet .sb'), y = sb ? sb.scrollTop : 0; f(); const s2 = document.querySelector('.sheet .sb'); if (s2) s2.scrollTop = y; };
function punchWords(t, line, seed){
  const f = frameOf(line), direct = material(expand(line), 10).filter(x => x.direct), strong = [...new Set(direct.slice(0, 4).map(x => D.cards[x.i].b))].slice(0, 2).flatMap(b => toks(blockName(b))), top = toks(expand(line)).concat(direct.flatMap(x => toks(headOf(D.cards[x.i].word) + ' ' + shortOf(D.cards[x.i]))), topicBlocks(f).spark ? [] : topicBlocks(f).b.slice(0, 2).flatMap(b => toks(blockName(b))));
  let rhyme = null; const at = activeTag(t), l = baseLine(t), rw = at ? at.w : l ? lastWordOf(l.t) : '';
  if (rw) { const g = tagSound(rw); rhyme = w => { if (stem(w) === stem(rw)) return 0; const so = soundOf(w); return rhymeKind(g.tl, g.sk, tail(so.s, so.si), false); }; }
  const cards = new Map(); material(expand(line), 40).forEach((x, n) => cards.set(D.cards[x.i].word, x.direct ? 3.2 : Math.max(.5, 1.8 - n * .04)));
  return candidates(line, top, { seed, rhyme, strong, cards, max:40 }); }
let CW = null; const cardIdOf = word => { if (!word || !D.ready) return ''; if (!CW || CW.n !== D.cards.length) { CW = { n:D.cards.length, m:new Map(D.cards.map(c => [c.word, c.id])) }; } return CW.m.get(word) || ''; };

// ---------- концовка: данные для шторки ----------
const mainWord = s => { const w = toks(s).filter(x => x.length > 2 && !['как', 'для', 'без', 'под', 'над', 'про'].includes(x)); return w[w.length - 1] || s; };
function endData(t, line, seed){
  const E = endings(line, seed), L = t.lines, i = Math.min(S.cur, L.length - 1), [a] = fragOf(L, i); let prev = null;
  for (let j = i - 1; j >= a; j--) if (L[j].t.trim() && !goalOf(L[j])) { prev = L[j]; break; }
  let rw = '', tl = '', sk = ''; if (prev) { rw = lastWordOf(prev.t); if (rw) { const so = soundOf(rw); tl = tail(so.s, so.si); sk = skelOf(tl); } }
  const sound = w => { const s = soundOf(lastWordOf(w)); return tail(s.s, s.si); };
  const rhymes = w => { if (!tl || !lastWordOf(w) || stem(lastWordOf(w)) === stem(rw)) return 0; const x = sound(w); return x === tl ? 2 : skelOf(x) === sk && likeness(tl, x) >= 2 * tl.length - 2 && tl.length > 1 ? 1 : 0; };
  const mark = arr => arr.map(x => ({ ...x, rh:rhymes(x.t) })).sort((x, y) => y.rh - x.rh);
  const about = expand(line) + ' ' + E.f.content.slice(-2).flatMap(w => assocOf(w).slice(0, 4)).join(' ');
  const hm = material(expand(E.f.head || line), 8), hid = new Set(hm.map(x => x.i)), direct = hm.concat(material(expand(line), 14).filter(x => !hid.has(x.i)).slice(0, hm.length ? 4 : 8));
  const tb = topicBlocks(E.f), pool = D.cards.map((c, n) => n).filter(n => tb.b.includes(D.cards[n].b) && !direct.some(x => x.i === n) && bestHook(D.cards[n])); let sd = seed; const rs = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const some = pool.map(n => [rs() + (bestHook(D.cards[n]).includes('**') ? .35 : 0) - tb.b.indexOf(D.cards[n].b) * .06, n]).sort((x, y) => y[0] - x[0]).slice(0, 16).map(x => ({ i:x[1] }));
  direct.splice(tb.spark ? 14 : Math.max(2, Math.min(direct.length, 6)), 0, ...some); const ids = new Set(direct.map(x => x.i));
  const world = mark(direct.concat(material(about, 20).filter(x => !ids.has(x.i)).slice(0, 8)).filter(x => !toks(line).map(stem).includes(stem(headOf(D.cards[x.i].word)))).slice(0, 30).map(x => { const c = D.cards[x.i]; return { t:insertForm(c), g:bestHook(c), id:c.id, hw:headOf(c.word) }; }));
  let rhyme = [];
  if (tl) { const topic = new Set(E.f.content.flatMap(w => [w, ...assocOf(w).slice(0, 12)]).map(stem));
    rhyme = phraseEnds().map(x => ({ t:x.p, g:x.g, r:rhymes(x.p), k:toks(x.p + ' ' + x.g).some(w => topic.has(stem(w))) ? 1 : 0 })).filter(x => x.r).sort((x, y) => (y.r + y.k * 1.5) - (x.r + x.k * 1.5)).slice(0, 18)
      .concat(rhymeMeaning(soundOf(rw), rw, line).slice(0, 12).map(x => ({ t:x.w, g:x.hook || bestHook(D.cards[x.ci]), id:D.cards[x.ci].id }))); }
  return { f:E.f, wait:E.wait, expr:mark(E.expr), flip:mark(E.flip), world, rhyme, rw };
}

// ---------- строка списка с крючком; карточка слова по зажатию ----------
const blockName = b => { const x = D.blocks.find(z => z.n === b); if (!x) return ''; const n = x.title.toLowerCase(); return n.length > 26 ? n.split(/\s+и\s+|,\s*/)[0] : n; };
function rowHTML(c, o){ const w = o.title || insertForm(c), hook = o.hook || bestHook(c);
  return '<div class="mrow' + (o.hot ? ' hot' : '') + '"><button class="mb" data-act="' + (o.act || 'matline') + '" data-v="' + esc(o.v || w) + '" data-hold="' + c.id + '" data-w="' + esc(w) + '"><b>' + esc(o.title || c.word) + '</b><small>' + esc(o.note || blockName(c.b)) + '</small>' +
    (hook ? '<span class="m">' + (o.title && !o.hook && headOf(c.word).toLowerCase() !== o.title.toLowerCase() ? esc(headOf(c.word)) + ': ' : '') + fmt(hook) + '</span>' : '') + '</button>' +
    '<button class="mx" data-act="matbox" data-v="' + esc(w) + '">＋</button></div>'; }
function twoHTML(d){
  if (!sensesReady()) { loadSenses().then(renderSheet); return '<div class="empty">загружаю толкования…</div>'; }
  const rows = twoWords(d.q, d.list);
  return rows.length ? rows.map(x => '<div class="mrow' + (x.own ? ' hot' : '') + '"><button class="mb" data-act="popany" data-v="' + esc(x.w) + '" data-hold="' + (x.id || '') + '" data-w="' + esc(x.w) + '"><b>' + esc(x.w) + '</b><small>' + x.n + ' ' + smysl(x.n) + (x.own ? ' · из твоей строки' : x.rh ? ' · рифма' : '') + '</small><span class="m">подумают: ' + esc(x.first) + '</span><span class="m">развернуть: <b>' + esc(x.turn) + '</b></span></button></div>').join('') : '<div class="empty">Слов с двумя смыслами к этой строке не нашлось</div>'; }
const smysl = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'смысл' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'смысла' : 'смыслов'; };
// слова с двумя и более смыслами: сначала из самой строки, потом из словаря по теме, потом рифмы
function twoWords(line, list, max = 24){
  const out = [], seen = new Set(), cut = s => s.length > 64 ? s.slice(0, 62).replace(/\s\S*$/, '') + '…' : s;
  const add = (w, o) => { const s = sensesOf(w), c = o.ci !== undefined && o.ci !== null ? D.cards[o.ci] : null, hooks = c ? hookList(c).map(h => h.replace(/\*\*/g, '')) : [];
    const key = stem(s ? s.lemma : w); if (seen.has(key)) return; const n = senseCount(w) + (c ? hooks.length : 0); if (n < 2) return; seen.add(key);
    const first = s ? s.list[0].t : shortOf(c), turns = [...hooks, ...(s ? s.list.slice(1).sort((a, b) => /перен|жарг|разг/.test(b.lab) - /перен|жарг|разг/.test(a.lab)).map(x => x.t) : [])];
    if (!first || !turns.length) return; out.push({ w:s && !c ? w : w, n, first:cut(first), turn:cut(turns[0]), turns, id:c ? c.id : '', ...o }); };
  toks(line).filter(w => w.length > 2 && !STOPW.has(w)).forEach(w => add(w, { own:true, ci:cardByHead(w) }));
  (list || []).forEach(x => { const h = headOf(D.cards[x.i].word); if (!/\s/.test(h)) add(insertForm(D.cards[x.i]), { ci:x.i }); });
  const last = lastWordOf(line); if (last && R.ready && out.length < max) { const so = soundOf(last); findRhymes(so.s, so.si, isLat(last)).exact.slice(0, 30).forEach(w => add(w, { rh:true, ci:cardByHead(w) })); }
  return out.slice(0, max); }
const STOPW = new Set('это эти этот эта как так что чтоб или там тут мой моя мои твой твоя они она оно его ему для под над про без все всё вся был была были есть нет уже ещё где кто день новый новая новые'.split(' '));
function popHTML(id, word){ const c = id ? D.cards[D.byId.get(id)] : null;
  let h = '<div class="pw">' + esc(word || c.word) + (c && c.say && !word ? ' <span class="muted">' + esc(c.say) + '</span>' : '') + '</div>';
  if (c) { const sh = shortOf(c);
    h += '<div class="muted">' + (word && headOf(c.word).toLowerCase() !== word.toLowerCase() ? esc(c.word) + ' · ' : '') + esc(blockName(c.b)) + '</div>';
    c.f.forEach(([k, x], n) => { if (x) h += '<div class="pf' + (/крюч/i.test(k) ? ' hk' : '') + '">' + (k && n ? '<i>' + (/крюч/i.test(k) ? 'Двойной смысл и крючки' : esc(k)) + '</i>' : '') + fmt(x) + '</div>'; });
    (c.mine || []).forEach(([k, x]) => { h += '<div class="pf hk"><i>твоё · ' + esc(k) + '</i>' + fmt(x) + '</div>'; });
    const near = material(c.word + ' ' + sh, 12).filter(x => D.cards[x.i].id !== c.id).slice(0, 4);
    if (near.length) h += '<div class="pf"><i>Рядом в словаре</i><div class="chips">' + near.map(x => '<button class="chip rh" data-act="popcard" data-v="' + D.cards[x.i].id + '">' + esc(D.cards[x.i].word) + '</button>').join('') + '</div></div>'; }
  h += sensesHTML(word || headOf(c.word), !!c);
  const w = word || insertForm(c);
  return '<div class="pveil" data-act="popclose"></div><div class="pop"><div class="pscroll">' + h + '</div><div class="pacts">' + (S.view === 'text' ? '<button class="main" data-act="popline" data-v="' + esc(w) + '">В строку</button>' : '') + '<button data-act="' + (S.view === 'text' ? 'rbox' : 'stockadd') + '" data-v="' + esc(w) + '">' + (S.view === 'text' ? 'В ящик' : 'В запас') + '</button>' + '<button data-act="popchain" data-v="' + esc(w) + '">→</button>' + (punchReady() && (marked(w) || senseCount(w) > 1) ? '<button data-act="popunch" data-v="' + esc(w) + '">⚡</button>' : '') + (c ? '<button data-act="popfav" data-v="' + c.id + '">' + (D.fav.has(c.id) ? '★' : '☆') + '</button>' : '') + '</div></div>'; }
// «слушатель подумает» — первое, банальное значение; дальше — куда можно развернуть; выражения — готовые переносные смыслы
function sensesHTML(word, hasCard){
  if (!sensesReady()) { loadSenses(); return hasCard ? '' : '<div class="muted">толкования ещё загружаются, открой ещё раз</div>'; }
  const s = sensesOf(word); if (!s) return hasCard ? '' : '<div class="muted">толкования нет</div>';
  const li = x => '<div class="sn">' + (x.lab ? '<em>' + esc(x.lab) + '</em> ' : '') + esc(x.t) + '</div>'; const n = senseCount(word);
  let h = '<div class="pf"><i>Слушатель подумает' + (ny2(s.lemma) !== ny2(word) ? ' · ' + esc(s.lemma) : '') + '</i>' + li(s.list[0]) + '</div>';
  const fig = x => /перен|жарг|разг|прост|мол/.test(x.lab) ? 1 : 0, rest = s.list.slice(1).sort((x, y) => fig(y) - fig(x)), alt = s.alt.slice(0, 2);
  if (rest.length || alt.length) h += '<div class="pf"><i>Куда развернуть · ' + (n - 1) + '</i>' + rest.map(li).join('') + alt.map(a => '<div class="sn"><b>' + esc(a.lemma) + '</b></div>' + a.list.slice(0, 3).map(li).join('')).join('') + '</div>';
  const ph = phrasesOf(s.lemma, 7); if (ph.length) h += '<div class="pf"><i>Выражения</i>' + ph.map(x => '<button class="phr" data-act="phrbox" data-v="' + esc(x.p) + '"><b>' + esc(x.p) + '</b> ' + esc(x.g) + '</button>').join('') + '</div>';
  return h; }
const ny2 = w => String(w).toLowerCase().replace(/ё/g, 'е');
function showPop(id, word){ if (!D.ready) return; S.pop = { id, word }; let p = $('#poplayer'); if (!p) { p = document.createElement('div'); p.id = 'poplayer'; $('#app').appendChild(p); } p.innerHTML = popHTML(id, word); if (navigator.vibrate) navigator.vibrate(8); }
function closePop(){ S.pop = null; const p = $('#poplayer'); if (p) p.innerHTML = ''; }
// зажатие
let holdT = null, holdXY = null, held = false;
document.addEventListener('pointerdown', e => { const b = e.target.closest('[data-hold]'); held = false; if (!b || !b.dataset.w) return; holdXY = [e.clientX, e.clientY];
  clearTimeout(holdT); holdT = setTimeout(() => { held = true; const ch = cardByHead(b.dataset.w); showPop(b.dataset.hold || (ch !== null ? D.cards[ch].id : ''), b.dataset.w); }, 380); });
document.addEventListener('pointermove', e => { if (holdXY && Math.hypot(e.clientX - holdXY[0], e.clientY - holdXY[1]) > 9) { clearTimeout(holdT); holdXY = null; } });
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(holdT); holdXY = null; }));
document.addEventListener('click', e => { if (held) { held = false; if (e.target.closest('[data-hold]')) { e.stopPropagation(); e.preventDefault(); } } }, true);
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-hold],#poplayer')) e.preventDefault(); });

// ---------- шторки ----------
function sheet(title, sub, body){ return '<div class="veil" data-act="close"></div><div class="sheet"><div class="sh"><div class="grab"></div><button class="x" data-act="close">✕</button><div class="st">' + title + '</div>' + (sub ? '<div class="ss">' + sub + '</div>' : '') + '</div><div class="sb">' + body + '</div></div>'; }
function renderSheet(){
  const k = S.sheet, L = $('#layer'); if (!k) { L.innerHTML = ''; return; }
  const t = T(), d = S.sd;
  if (humSheet(k, d, L) || beatSheet(k, d, L)) return;
  if (k === 'nothing') {
    if (!D.ready) { L.innerHTML = sheet('Ничего нет', '', '<div class="empty">загружаю словарь…</div>'); loadDict().then(renderSheet).catch(() => { D.ready = false; }); return; }
    d.q = d.q || QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    if (d.ci === undefined) d.ci = D.byId.get(dayContent(0).word.id);
    const c = D.cards[d.ci], sh = shortOf(c);
    L.innerHTML = sheet('Ничего нет — начнём со слова', 'зацепись за слово: ответь на вопрос или пиши сразу',
      '<div class="card big"><div><div class="w">' + esc(c.word) + '</div>' + (c.say ? '<div class="muted">' + esc(c.say) + '</div>' : '') + '<div class="muted" style="margin-top:6px">' + fmt(sh) + '</div></div></div>' +
      '<div class="row" style="margin:8px 0 14px"><button class="btn" data-act="otherword">другое слово</button><button class="btn" data-act="nothingwrite">писать сразу</button></div>' +
      '<div class="qcard">' + esc(d.q) + '</div><button class="btn" data-act="otherq">другой вопрос</button><textarea id="ans" rows="3" style="margin-top:10px" placeholder="Отвечай как есть, без рифмы…"></textarea>' +
      '<button class="btn big main" data-act="nothingdone">Готово — ответ ляжет мыслью</button>'); }
  else if (k === 'word' && !d.w) L.innerHTML = sheet('Есть слово или чувство', 'одно слово («мороз») или своими словами («один вечером, сжимает»)',
      '<textarea id="ans" rows="2" placeholder="слово или чувство"></textarea><button class="btn big main" data-act="wordnext">Дальше</button>');
  else if (k === 'word') {
    d.tab = d.tab || (/^([а-яё-]+|[a-z'’-]+)$/i.test(d.w) ? 'rh' : 'sm'); d.box = d.box || [];
    let list = '';
    if (d.tab === 'rh') { if (!R.ready) { list = '<div class="empty">загружаю рифмы…</div>'; loadRhymes().then(renderSheet); }
      else { const w = lastWordOf(d.w), so = w ? soundOf(w) : null; const r = so ? findRhymes(so.s, so.si, isLat(w)) : { exact:[], near:[] }, e = so ? findEng(so.s, so.si, w) : { exact:[], near:[] }; d.items = r.exact.slice(0, 18).concat(r.near.slice(0, 18), e.exact.concat(e.near).slice(0, 10).map(x => x.w)); } }
    else if (d.tab === 'sm') { if (!d.sem) { list = '<div class="empty">ищу по смыслу… (первый раз качается модель, ~120 МБ)</div>'; semTop(d.w, 14).then(ix => { d.sem = ix.map(i => D.cards[i]).filter(c => c.b !== 40).map(c => c.word); renderSheet(); }).catch(e => { d.sem = []; toast('Поиск по смыслу недоступен'); renderSheet(); }); }
      else d.items = d.sem; }
    else { d.qs = d.qs || QUESTIONS.slice().sort(() => Math.random() - .5).slice(0, 6); d.items = d.qs; }
    if (!list) list = '<div class="chips">' + (d.items || []).map(x => '<button class="chip rh' + (d.box.includes(x) ? ' in' : '') + '" data-act="wbox" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>';
    L.innerHTML = sheet('«' + esc(d.w) + '»', 'собери ящик: тап — положить, ещё тап — убрать',
      '<div class="seg">' + [['rh','Рифмы'],['sm','По смыслу'],['qs','Вопросы']].map(([k2, n]) => '<button data-act="wtab" data-v="' + k2 + '" class="' + (d.tab === k2 ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' + list +
      '<div class="muted" style="margin-top:12px">в ящике: ' + (d.box.length ? esc(d.box.join(', ')) : 'пусто') + '</div><button class="btn big main" data-act="worddone">Написать строку</button>'); }
  else if (k === 'zahod') {
    if (!D.ready) { L.innerHTML = sheet('Заход', '', '<div class="empty">загружаю…</div>'); loadDict().then(renderSheet); return; }
    if (!d.order) { d.order = zahodOrder(t); d.i = 0; }
    const zg = [...new Set(D.cards.filter(c => c.b === 40).map(c => c.g))];
    if (!d.order.length) { d.zg = ''; d.order = zahodOrder(t); d.i = 0; }
    const z = D.cards[d.order[d.i % d.order.length]], f = z.f;
    L.innerHTML = sheet('Заход', 'вправо — сразу в текст, влево — мимо',
      '<div class="zgs"><button data-act="zgrp" data-v="" class="' + (!d.zg ? 'on' : '') + '">Все</button>' + zg.map(g => '<button data-act="zgrp" data-v="' + esc(g) + '" class="' + (d.zg === g ? 'on' : '') + '">' + esc(g) + '</button>').join('') + '</div>' +
      '<div class="card big" id="card"><div><div class="w">' + esc(z.word) + '…</div><div class="muted" style="margin-top:6px">' + esc((f[0] || ['', ''])[1]) + ' · ' + esc((f[1] || ['', ''])[1]) + '</div></div></div>' +
      '<div class="swipe"><button class="btn" data-act="zskip">← мимо</button><button class="btn main" data-act="ztake">беру →</button></div>' +
      '<div class="muted" style="text-align:center;margin-top:8px">' + (d.i % d.order.length + 1) + ' из ' + d.order.length + (d.ranked ? ' · сверху — ближе по смыслу к строке' : '') + '</div>');
    bindSwipe('ztake', 'zskip', null); }
  else if (k === 'line') L.innerHTML = sheet('Есть строчка', 'вбей или надиктуй (микрофон на клавиатуре)', '<input class="f" id="ans" placeholder="первая строка" enterkeyhint="done"><button class="btn big main" data-act="linedone">Дальше</button>');
  else if (k === 'why') { d.q = d.q || QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    L.innerHTML = sheet('Почему?', 'вопрос к тексту. Ответ ляжет мыслью над строками',
      '<div class="qcard">' + esc(d.q) + '</div><button class="btn" data-act="otherq">другой вопрос</button><textarea id="ans" rows="3" style="margin-top:10px" placeholder="Потому что…"></textarea><button class="btn big main" data-act="whydone">Добавить мыслью</button>'); }
  else if (k === 'ask') { const p = buildPrompt(t);
    L.innerHTML = sheet('Спросить у ИИ', 'скопируй, вставь в DeepSeek или Claude, ответ вставь ниже',
      '<pre class="prompt" id="prompt">' + esc(p) + '</pre><button class="btn big main" data-act="copy">Скопировать запрос</button>' +
      '<div class="row" style="margin-top:8px">' + AI.map(a => '<a class="btn" href="' + a.url + '" target="_blank" rel="noopener">' + a.name + ' ↗</a>').join('') + '</div>' +
      '<div class="grp">Ответ ИИ</div><textarea id="aians" rows="4" placeholder="вставь сюда всё, что ответил ИИ"></textarea>' +
      '<div class="row" style="margin-top:8px"><button class="btn" data-act="pasteai">Вставить из буфера</button><button class="btn main" data-act="parse">Разобрать в колоду</button></div>'); }
  else if (k === 'deck') { const list = d.list || [];
    if (!list.length) L.innerHTML = sheet('Колода пуста', 'все варианты разобраны', '<button class="btn big" data-act="sheet" data-v="ask">Спросить у ИИ ещё раз</button>');
    else { d.i = Math.min(d.i || 0, list.length - 1); const v = list[d.i];
      L.innerHTML = sheet('Варианты от ИИ', 'вариант ' + (d.i + 1) + ' из ' + list.length + ' · ' + syl(v) + ' ' + sl(syl(v)) + ' · свайп: ← не то, ↑ в текст, → дальше',
        '<div class="card" id="card">' + esc(v) + '</div><div class="swipe"><button class="btn" data-act="dropdeck">← не то</button><button class="btn main" data-act="takedeck">↑ в текст</button><button class="btn" data-act="nextdeck">дальше →</button></div>');
      bindSwipe(); } }
  else if (k === 'rhythm') { const l = curLine();
    L.innerHTML = sheet('Отстучи строку ' + (S.cur + 1), '«' + esc(l.t) + '» · тап — слог, держишь — протяжный, тап по точке — сильный',
      '<div class="pad" id="pad">тапай сюда на каждый слог<br>держи дольше на протяжных</div><div class="track" id="track"></div><div class="count" id="count"></div>' +
      '<div class="swipe"><button class="btn" data-act="rreset">Заново</button><button class="btn" data-act="sheet" data-v="syll">По слогам</button><button class="btn main" data-act="rdone">Готово</button></div>');
    bindPad(); drawTaps(); }
  else if (k === 'syll') { const l = curLine(); d.parts = d.parts || syllables(l.t).map(x => x.trim()); d.st = d.st || [...(l.strong || [])];
    L.innerHTML = sheet('По слогам', 'тап по слогу — сильный · «+» между слогами — склеить (проглатываешь)',
      '<div class="syl">' + d.parts.map((p, i) => (i ? '<button class="j" data-act="join" data-v="' + i + '">+</button>' : '') + '<button class="s' + (d.st.includes(i) ? ' str' : '') + '" data-act="sstr" data-v="' + i + '">' + esc(p) + '</button>').join('') + '</div>' +
      '<div class="count">' + d.parts.length + ' ' + sl(d.parts.length) + '</div><div class="swipe"><button class="btn" data-act="sreset">Сбросить</button><button class="btn main" data-act="sdone">Готово</button></div>'); }
  else if (k === 'rhyme') {
    if (!R.ready) { L.innerHTML = sheet('Рифмы', '', '<div class="empty">загружаю словарь рифм…</div>'); loadRhymes().then(renderSheet).catch(e => { L.innerHTML = sheet('Рифмы', '', '<div class="soon">Не загрузилось: ' + esc(e.message) + '</div>'); }); return; }
    const l = baseLine(t), at0 = activeTag(t); d.w = d.w || (at0 ? at0.w : lastWordOf(l ? l.t : '')); if (!d.w) { L.innerHTML = sheet('Рифмы', '', '<div class="empty">В строке нет слова</div>'); return; }
    const so = soundOf(d.w), lat = isLat(d.w); if (d.si === undefined) d.si = so.si;
    d.f = d.f || 'all';
    const r = findRhymes(so.s, d.si, lat), e2 = findEng(so.s, d.si, d.w), fitN = n => d.f === 'all' || (d.f === '4' ? n >= 4 : n === +d.f), fit = w => fitN(syl(w));
    const echip = x => '<button class="chip rh" data-act="rpick" data-v="' + esc(x.w) + '">' + esc(x.w) + '<small>' + esc(x.s) + '</small></button>';
    const ee = e2.exact.filter(x => fitN(sylS(x.s))), en = e2.near.filter(x => fitN(sylS(x.s)));
    const chip = w => '<button class="chip rh' + (cardByHead(w) !== null ? ' has' : sensesReady() && senseCount(w) > 1 ? ' two' : '') + '" data-act="rpick" data-v="' + esc(w) + '" data-hold="" data-w="' + esc(w) + '">' + esc(w) + '<small>' + syl(w) + '</small></button>';
    const stressRow = [...so.s].map((c, i) => VS.includes(c) ? '<button class="sl' + (i === d.si ? ' on' : '') + '" data-act="rsi" data-v="' + i + '">' + esc(c) + '</button>' : '<span>' + esc(c) + '</span>').join('');
    const ex = r.exact.filter(fit), nr = r.near.filter(fit);
    const [fa, fb] = fragOf(t.lines, Math.min(S.cur, t.lines.length - 1)), about = t.lines.slice(fa, fb + 1).map(x => x.t).join(' ');
    d.mean = d.mean && d.meanSi === d.si ? d.mean : rhymeMeaning({ s:so.s, si:d.si }, d.w, about); d.meanSi = d.si;
    const mn = d.mean.filter(x => fitN(isLat(x.w) ? sylS(soundOf(x.w).s) : syl(x.w)));
    d.rtab = d.rtab || (mn.length ? 'mean' : 'ex');
    const tabs = [['mean', 'Со смыслом'], ['ex', 'Точные ' + ex.length], ['nr', 'Созвучия'], ['en', 'Англ.']];
    let list;
    if (d.rtab === 'mean') list = (mn.length ? mn.map(x => rowHTML(D.cards[x.ci], { title:x.w, note:x.kind + (x.kind === 'в крючке' ? ' · ' + D.cards[x.ci].word : ' · ' + blockName(D.cards[x.ci].b)), hook:x.hook, act:'rpick', v:x.w })).join('') : '<div class="empty">Слов с карточкой к этой рифме нет — загляни в «Точные»</div>') +
      (() => { const have = new Set(mn.map(x => stem(x.w))), m2 = sensesReady() ? ex.filter(w => !have.has(stem(w)) && senseCount(w) > 1).slice(0, 12) : [], rest = ex.filter(w => !m2.includes(w) && !have.has(stem(w))).slice(0, 14);
        return (m2.length ? '<div class="grp">Точные с двойным смыслом</div>' + m2.map(w => { const s = sensesOf(w); return '<div class="mrow"><button class="mb" data-act="rpick" data-v="' + esc(w) + '" data-hold="" data-w="' + esc(w) + '"><b>' + esc(w) + '</b><small>' + senseCount(w) + ' ' + smysl(senseCount(w)) + '</small><span class="m">' + esc(s.list[0].t) + '</span>' + (s.list[1] ? '<span class="m">' + esc(s.list[1].t) + '</span>' : '') + '</button><button class="mx" data-act="matbox" data-v="' + esc(w) + '">＋</button></div>'; }).join('') : '') +
          (rest.length ? '<div class="grp">Ещё точные</div><div class="chips">' + rest.map(chip).join('') + '</div>' : ''); })();
    else if (d.rtab === 'ex') list = '<div class="chips">' + (ex.length ? ex.map(chip).join('') : '<span class="muted">точных нет</span>') + '</div>';
    else if (d.rtab === 'nr') list = '<div class="chips">' + (nr.length ? nr.map(chip).join('') : '<span class="muted">нет</span>') + '</div>';
    else list = '<div class="chips">' + (ee.length + en.length ? ee.map(echip).join('') + en.map(echip).join('') : '<span class="muted">нет</span>') + '</div>';
    L.innerHTML = sheet('Рифмы к «' + esc(d.w) + '»', 'тап — конец следующей строки, зажми — карточка слова',
      '<div class="stressrow">' + (lat ? 'звучит: ' : 'ударение: ') + stressRow + '</div>' +
      (!lat ? '' : d.psay ? '<div class="row" style="margin-top:8px"><input class="f" id="psay" value="' + esc(so.s) + '" style="flex:1;margin:0"><button class="btn main" data-act="psaydone">Готово</button></div>' :
        '<div class="row" style="margin-top:8px"><button class="btn" data-act="psay">' + (so.src === 'guess' ? 'слова нет в базе, звучание угадал — поправить' : 'звучит не так — поправить') + '</button></div>') +
      '<div class="seg" style="margin-top:10px">' + tabs.map(([k2, n]) => '<button data-act="rtab" data-v="' + k2 + '" class="' + (d.rtab === k2 ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
      '<div class="sylf"><span class="muted">слогов:</span>' + [['all','все'],['1','1'],['2','2'],['3','3'],['4','4+']].map(([k2, n]) => '<button class="' + (d.f === k2 ? 'on' : '') + '" data-act="rf" data-v="' + k2 + '">' + n + '</button>').join('') + '</div>' + list);
  }
  else if (k === 'mat') {
    if (!D.ready || !R.ready) { L.innerHTML = sheet('Материал', '', '<div class="empty">загружаю словарь…</div>'); Promise.all([loadDict(), loadRhymes()]).then(renderSheet); return; }
    const l = baseLine(t), [fa, fb] = t.lines.length ? fragOf(t.lines, Math.min(S.cur, t.lines.length - 1)) : [0, -1];
    d.q = d.q || (l ? l.t : t.thoughts.join(' ')); d.about = d.about || (t.lines.slice(fa, fb + 1).map(x => x.t).join(' ') + ' ' + t.thoughts.join(' '));
    if (!d.q.trim()) { L.innerHTML = sheet('Материал', '', '<div class="empty">Напиши строку или мысль — словарь подберёт слова к ней</div>'); return; }
    d.list = d.list || (() => { const own = material(expand(d.q), 24), ids = new Set(own.map(x => x.i)); return own.concat(material(expand(d.about), 24).filter(x => !ids.has(x.i)).slice(0, 10)); })();
    d.tab = d.tab || 'all';
    const tabs = [['all','Всё'],['hooks','Крючки'],['two','Смыслы'],['rh','Рифма']]; let list = '';
    if (d.tab === 'all') {
      list = d.list.length ? d.list.map(x => rowHTML(D.cards[x.i], { hot:x.direct })).join('') : '<div class="empty">По корню слов ничего — попробуй по смыслу</div>';
      list += d.sem ? (d.sem.length ? '<div class="grp">По смыслу</div>' + d.sem.filter(i => !d.list.some(x => x.i === i)).map(i => rowHTML(D.cards[i], {})).join('') : '') : '<button class="btn big" data-act="msem"' + (d.semLoad ? ' disabled' : '') + '>' + (d.semLoad ? 'ищу по смыслу…' : 'Ещё — по смыслу') + '</button>'; }
    else if (d.tab === 'hooks') { const hs = d.list.flatMap(x => hookList(D.cards[x.i]).filter(h => x.direct || h.includes('**')).slice(0, 3).map(h => [h, D.cards[x.i]])).slice(0, 40);
      list = hs.length ? hs.map(([h, c]) => '<div class="mrow"><button class="mb" data-act="matbox" data-v="' + esc(h.replace(/\*\*/g, '')) + '" data-hold="' + c.id + '" data-w="' + esc(c.word) + '"><span class="m">' + fmt(h) + '</span><small>' + esc(c.word) + '</small></button><button class="mx" data-act="popcard" data-v="' + c.id + '">⋯</button></div>').join('') : '<div class="empty">Крючков к этой строке нет</div>'; }
    else if (d.tab === 'two') list = twoHTML(d);
    else { const w = lastWordOf(d.q), so = soundOf(w), mn = w ? rhymeMeaning(so, w, d.about) : [];
      list = mn.length ? mn.map(x => rowHTML(D.cards[x.ci], { title:x.w, note:x.kind + (x.kind === 'в крючке' ? ' · ' + D.cards[x.ci].word : ''), hook:x.hook, act:'rpick', v:x.w })).join('') : '<div class="empty">Рифм с карточкой нет — открой «Рифма» на панели</div>'; }
    L.innerHTML = sheet('К строке «' + esc(d.q.length > 34 ? '…' + d.q.slice(-32) : d.q) + '»', d.tab === 'hooks' ? 'тап — крючок в ящик, зажми — карточка' : d.tab === 'rh' ? 'тап — конец следующей строки, зажми — карточка' : 'тап — в строку, ＋ — в ящик, зажми — карточка',
      '<div class="seg">' + tabs.map(([k2, n]) => '<button data-act="mtab" data-v="' + k2 + '" class="' + (d.tab === k2 ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' + list); }
  else if (k === 'line1') { const l = t.lines[d.i]; if (!l) { L.innerHTML = ''; return; } const can = l.t.trim() && !goalOf(l);
    L.innerHTML = sheet('Строка', '«' + esc(l.t.trim()) + '» · ' + (l.ry || lineSyl(l.t)) + ' ' + sl(l.ry || lineSyl(l.t)) + (l.ry ? ' по отстуку' : ''), (l.taps ? '<div class="rhyprev">' + lineHTML(l) + '</div>' : '') +
      '<div class="grid6"><button class="big" data-act="linego" data-v="rhythm"' + (can ? '' : ' disabled') + '>Ритм<small>' + (l.taps ? 'отстучать заново' : 'отстучать строку') + '</small></button><button class="big" data-act="linego" data-v="syll"' + (can ? '' : ' disabled') + '>По слогам<small>сильные и склейки</small></button>' +
      '<button class="big" data-act="starmore">' + (l.star ? '★ Годное' : '☆ Годное') + '<small>' + (l.star ? 'снять отметку' : 'отметить строку') + '</small></button><button class="big" data-act="linerhyme"' + (can ? '' : ' disabled') + '>Рифма к ней<small>подсказки к концу строки</small></button>' +
      '<button class="big" data-act="linestock">В запас<small>сохранить копию</small></button><button class="big" data-act="delline">Удалить<small>убрать строку</small></button></div>'); }
  else if (k === 'frag') { const F = splitFrags(t.lines), p = F.pieces[d.k]; if (!p) { L.innerHTML = ''; return; } const ln = fragLink(F.pieces, d.k), n = F.pieces.length;
    L.innerHTML = sheet('Мысль ' + (d.k + 1) + ' из ' + n, '«' + esc(p.filter(l => l.t.trim()).map(l => l.t.trim()).join(' / ').slice(0, 90)) + '»',
      (ln ? '<button class="btn big main" data-act="fragdo" data-v="link">Поставить к «…' + esc(ln.other) + '» — рифма к «' + esc(ln.mine) + '»</button>' : '') +
      '<div class="grid6" style="margin-top:10px"><button class="big" data-act="fragdo" data-v="up"' + (d.k ? '' : ' disabled') + '>↑ Выше<small>поменять с верхней</small></button><button class="big" data-act="fragdo" data-v="down"' + (d.k < n - 1 ? '' : ' disabled') + '>↓ Ниже<small>поменять с нижней</small></button>' +
      '<button class="big" data-act="fragdo" data-v="joinup"' + (d.k ? '' : ' disabled') + '>Склеить с верхней<small>убрать черту</small></button><button class="big" data-act="fragdo" data-v="joindown"' + (d.k < n - 1 ? '' : ' disabled') + '>Склеить с нижней<small>убрать черту</small></button>' +
      '<button class="big" data-act="fragdo" data-v="stock">В запас<small>убрать из текста</small></button><button class="big" data-act="fragdo" data-v="copy">Скопировать<small>только эту мысль</small></button></div>'); }
  else if (k === 'stock1') { const x = STOCK.find(y => y.t === d.t) || { t:d.t }, lt = texts.get(S.lastText) || [...texts.values()].filter(y => !y.archived).sort((a, b) => b.updated - a.updated)[0];
    L.innerHTML = sheet('Запас', esc(x.src || ''), '<div class="qcard" style="white-space:pre-line">' + esc(x.t) + '</div>' + (lt ? '<button class="btn big main" data-act="stockto" data-v="last">В текст «' + esc(titleOf(lt).slice(0, 26)) + '»</button>' : '') + '<button class="btn big" data-act="stockto" data-v="new">Новый текст с этого</button><button class="btn big" data-act="stockto" data-v="copy">Скопировать</button>' + (STOCK.some(y => y.t === d.t) ? '<button class="btn big danger" data-act="stockto" data-v="del">Убрать из запаса</button>' : '')); }
  else if (k === 'tags') {
    const here = tagsHere(t), cur = targetHere(t), L0 = t.lines.length ? fragOf(t.lines, Math.min(S.cur, t.lines.length - 1)) : [0, -1], lines = t.lines.slice(L0[0], L0[1] + 1).filter(l => l.t.trim());
    const col = w => { const g = tagSound(w); const h = here.find(x => x.w === w) || here.find(x => rhymeKind(x.tl, x.sk, g.tl, false) === 2); return h && w.length > 2 ? 't' + h.n : ''; };
    L.innerHTML = sheet('К какому слову рифма', 'тапни слово — подсказки пойдут к нему; тапни ещё раз — вернётся авто',
      '<div class="wpick">' + lines.map(l => '<div>' + (l.t.match(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*|[A-Za-z][A-Za-z'’]*/g) || []).map(raw => { hintOf(raw); const w = plain(raw.toLowerCase().replace(/’/g, "'")); return '<button class="' + (STOPW.has(w) ? '' : col(w)) + (cur === w ? ' on' : '') + '" data-act="tagword" data-v="' + esc(w) + '">' + esc(raw) + (cur === w ? ' ×' : '') + '</button>'; }).join('') + '</div>').join('') + '</div>' +
      '<div class="row" style="margin-top:12px;flex-wrap:nowrap"><input class="f" id="tagown" placeholder="или впиши своё слово" autocapitalize="off" style="flex:1;margin:0"><button class="btn main" data-act="tagown">Выбрать</button></div>'); }
  else if (k === 'punch') {
    if (!D.ready || !R.ready || !sensesReady() || !endingsReady() || !punchReady()) { L.innerHTML = sheet('Панч', '', '<div class="empty">загружаю…</div>'); Promise.all([loadDict(), loadRhymes(), loadSenses(), loadEndings(), loadPunch()]).then(renderSheet); return; }
    const l = baseLine(t), line = l ? l.t : t.thoughts.join(' '); d.seed = d.seed || 1 + Math.floor(Math.random() * 99999);
    if (!d.w) { // шаг 1: слово
      d.list = d.list || punchWords(t, line, d.seed);
      L.innerHTML = sheet('Панч · какое слово развернём', line ? 'к строке «' + esc(line.length > 34 ? '…' + line.slice(-32) : line) + '»' : 'слова с двумя и больше смыслами',
        '<div class="row" style="flex-wrap:nowrap;margin-bottom:10px"><input class="f" id="pown" placeholder="своё слово" autocapitalize="off" style="flex:1;margin:0"><button class="btn main" data-act="pown">Взять</button><button class="btn" data-act="pmore">🎲</button></div>' +
        d.list.map(x => '<div class="mrow' + (x.own ? ' hot' : '') + '"><button class="mb" data-act="pword" data-v="' + esc(x.w) + '" data-hold="' + cardIdOf(x.card) + '" data-w="' + esc(x.w) + '"><b>' + esc(x.w) + '</b><small>' + x.n + ' ' + smysl(x.n) + (x.own ? ' · из твоей строки' : '') + (x.card ? ' · из словаря' : '') + '</small>' + (x.rh ? '<small class="rhm">рифма</small>' : '') + '<span class="m">' + x.turns.map(esc).join(' · ') + '</span>' + (punOf(x.w) ? '<span class="m">слышится <b>«' + esc(punOf(x.w)) + '»</b></span>' : '') + '</button></div>').join('')); return; }
    d.turns = d.turns || turnsOf(d.w); d.a = d.a ?? 0;
    if (!d.step3) { // шаг 2: два смысла
      L.innerHTML = sheet('«' + esc(d.w) + '»', d.b === undefined || d.b === null ? 'первый смысл подумают сами — теперь выбери, чем окажется' : 'можно поменять: тап по смыслу',
        (d.turns.length < 2 ? '<div class="empty">У этого слова нашёлся один смысл — возьми другое или впиши свой ниже</div>' : '') +
        d.turns.map((x, i) => '<button class="psn' + (d.a === i ? ' a' : d.b === i ? ' b' : '') + '" data-act="psense" data-v="' + i + '">' + (d.a === i ? '<i>①</i>' : d.b === i ? '<i>②</i>' : '<i></i>') + '<span><b>' + esc(x.t) + '</b>' + (d.a === i ? '<small>слушатель подумает это</small>' : d.b === i ? '<small>а окажется это</small>' : x.g ? '<small>' + esc(x.g) + '</small>' : x.src ? '<small>' + esc(x.src) + '</small>' : '') + '</span></button>').join('') +
        '<div class="row" style="flex-wrap:nowrap;margin-top:10px"><input class="f" id="psense" placeholder="впиши свой смысл" style="flex:1;margin:0"><button class="btn" data-act="psenseadd">Добавить</button></div>' +
        '<div class="row" style="flex-wrap:nowrap;margin-top:4px"><button class="btn big" data-act="pback">‹ Другое слово</button>' + (cardIdOf((marked(d.w) || {}).card) ? '<button class="btn big" data-act="popcard" data-v="' + cardIdOf(marked(d.w).card) + '">Карточка</button>' : '') + '<button class="btn big main" data-act="pnext"' + (d.b === undefined || d.b === null ? ' disabled' : '') + '>Дальше</button></div>'); return; }
    // шаг 3: подводка и удар
    const A = d.turns[d.a], B = d.turns[d.b]; if (!d.form) { const q = (B.t.match(/«(.+?)»/) || [])[1], j = q ? q.replace(/\s/g, '') : ''; d.form = j && /звучит|слышится/.test(B.t) && Math.abs(j.length - d.w.length) < 4 ? j : d.w; }
    const lw = lastWordOf(d.form), so = soundOf(lw), kin = w => stem(w) === stem(lw) || (lw.length > 4 && (w.endsWith(lw.slice(-4)) && /ть$|ться$/.test(lw)) || (lw.length > 4 && w.startsWith(lw.slice(0, 4))));
    d.rh = d.rh || [...new Set(rhymeMeaning(so, lw, A.t + ' ' + line).slice(0, 8).map(x => x.w).concat((r => r.exact.slice(0, 14).concat(r.near.slice(0, 10)))(findRhymes(so.s, so.si, isLat(lw)))))].filter(w => !kin(w)).slice(0, 26);
    d.la = d.la || leadWords(d.w, A.t + ' ' + (A.g || '')); d.lb = d.lb || leadWords(d.w, B.t + ' ' + (B.g || '')); d.box = d.box || [];
    const pick = (w, act) => '<button class="chip rh' + (d.box.includes(w) || d.pr === w ? ' in' : '') + '" data-act="' + act + '" data-v="' + esc(w) + '" data-hold="" data-w="' + esc(w) + '">' + esc(w) + '</button>';
    L.innerHTML = sheet('«' + esc(d.w) + '»: ' + esc(A.t) + ' → ' + esc(B.t), 'строчки твои, здесь — опора',
      '<div class="slotb"><b>Подводка · веди к «' + esc(A.t) + '»</b><span>слова под рукой (тап — в ящик)</span><div class="chips">' + d.la.map(w => pick(w, 'pbox')).join('') + '</div><span>закончить на рифму</span><div class="chips">' + d.rh.map(w => pick(w, 'prhyme')).join('') + '</div></div>' +
      '<div class="slotb hit"><b>Удар · «' + esc(B.t) + '»</b><span>последнее слово, поправь форму, если нужно' + (punOf(d.form) ? ' · слышится «' + esc(punOf(d.form)) + '»' : '') + '</span><div class="row" style="flex-wrap:nowrap;margin-bottom:8px"><input class="f" id="pform" value="' + esc(d.form) + '" autocapitalize="off" style="flex:1;margin:0"><button class="btn" data-act="pform">Обновить</button></div><div class="chips">' + d.lb.map(w => pick(w, 'pbox')).join('') + '</div></div>' +
      '<div class="row" style="flex-wrap:nowrap"><button class="btn big" data-act="pstep2">‹ Смыслы</button><button class="btn big main" data-act="pdone">В текст</button></div>'); }
  else if (k === 'end') {
    const l = curLine() || { t:'' }; d.line = d.line || l.t;
    if (!D.ready || !R.ready || !sensesReady() || !endingsReady()) { L.innerHTML = sheet('Концовка', '', '<div class="empty">загружаю…</div>'); Promise.all([loadDict(), loadRhymes(), loadSenses(), loadEndings()]).then(renderSheet); return; }
    d.seed = d.seed || 1 + Math.floor(Math.random() * 9999); d.tab = d.tab || 'all'; d.data = d.data || endData(t, d.line, d.seed);
    const E = d.data, sec = (title, sub, rows) => rows ? '<div class="grp">' + title + (sub ? '<span class="gs">' + sub + '</span>' : '') + '</div>' + rows : '';
    const row = x => '<div class="mrow' + (x.rh ? ' hot' : '') + '"><button class="mb" data-act="matline" data-v="' + esc(x.t) + '" data-hold="' + (x.id || '') + '" data-w="' + esc(x.hw || x.t) + '"><b>' + esc(x.t) + '</b>' + (x.rh ? '<small class="rhm">рифма</small>' : '') + (x.full && x.full !== x.t ? '<small>' + esc(x.full) + '</small>' : '') + (x.g ? '<span class="m">' + fmt(x.g) + '</span>' : '') + '</button><button class="mx" data-act="chain" data-v="' + esc(x.hw || x.t) + '">→</button></div>';
    const chipsW = a => '<div class="chips">' + a.map(w => '<button class="chip rh" data-act="matline" data-v="' + esc(w) + '" data-hold="" data-w="' + esc(w) + '">' + esc(w) + '</button>').join('') + '</div>';
    const S1 = (n) => ({
      wait: E.wait.length ? sec('Ждут', 'слушатель угадает сам', chipsW(E.wait.slice(0, n ? 8 : 14))) : '',
      expr: sec('Выражения', 'готовый переносный смысл', E.expr.slice(0, n || 24).map(row).join('')),
      flip: E.flip.length ? sec('Наоборот', 'чего здесь не ждут', chipsW(E.flip.slice(0, n ? 8 : 24).map(x => x.t))) : '',
      world: E.world.length ? sec('Мир', 'из твоего словаря', E.world.slice(0, n || 24).map(row).join('')) : '',
      rhyme: E.rhyme.length ? sec('Под рифму', 'к «' + esc(E.rw) + '»', E.rhyme.slice(0, n || 30).map(row).join('')) : '' });
    const tabs = [['all','Всё'],['wait','Ждут'],['expr','Выражения'],['flip','Наоборот'],['world','Мир']].concat(E.rhyme.length ? [['rhyme','Рифма']] : []);
    const part = S1(d.tab === 'all' ? 4 : 0);
    L.innerHTML = sheet('«' + esc(d.line.length > 36 ? '…' + d.line.slice(-34) : d.line) + ' …»', 'тап — в строку, → ещё в эту сторону, зажми — карточка',
      '<div class="zgs">' + tabs.map(([k2, n]) => '<button data-act="mtab" data-v="' + k2 + '" class="' + (d.tab === k2 ? 'on' : '') + '">' + n + '</button>').join('') + '<button data-act="endmore">🎲 другие</button></div>' +
      (d.tab === 'all' ? part.wait + part.rhyme + part.expr + part.flip + part.world : part[d.tab] || '<div class="empty">здесь пусто — нажми «другие»</div>')); }
  else if (k === 'chain') {
    const w = d.path[d.path.length - 1], as = assocOf(w).filter(x => !d.path.includes(x)), ci = cardByHead(w), mats = material(expand(w), 8).filter(x => x.i !== ci).slice(0, 6), se = sensesOf(w), ph = phrasesOf(se ? se.lemma : w, 6);
    L.innerHTML = sheet(d.path.map(esc).join(' → '), 'тап по слову — дальше, зажми — карточка',
      '<div class="row" style="margin-bottom:12px"><button class="btn main" data-act="matline" data-v="' + esc(w) + '">«' + esc(w) + '» в строку</button><button class="btn" data-act="rbox" data-v="' + esc(w) + '">В ящик</button><button class="btn" data-act="chainback">‹ Назад</button></div>' +
      '<div class="grp">Рядом по смыслу</div>' + (as.length ? '<div class="chips">' + as.map(x => '<button class="chip rh' + (cardByHead(x) !== null ? ' has' : senseCount(x) > 1 ? ' two' : '') + '" data-act="chain" data-v="' + esc(x) + '" data-hold="" data-w="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>' : '<span class="muted">соседей не нашлось</span>') +
      (ph.length ? '<div class="grp">Выражения</div>' + ph.map(x => '<div class="mrow"><button class="mb" data-act="matline" data-v="' + esc(x.p) + '"><b>' + esc(x.p) + '</b><span class="m">' + esc(x.g) + '</span></button></div>').join('') : '') +
      (ci !== null || mats.length ? '<div class="grp">Из словаря</div>' + (ci !== null ? rowHTML(D.cards[ci], { hot:true }) : '') + mats.map(x => rowHTML(D.cards[x.i], {})).join('') : '')); }
  else if (k === 'more') { const l = curLine() || { t:'' }, can = l.t && !goalOf(l);
    L.innerHTML = sheet('Ещё', l.t ? 'строка: «' + esc(l.t.slice(0, 40)) + '»' : '',
      '<div class="grid6"><button class="big" data-act="sheet" data-v="why">Почему?<small>вопрос к строке</small></button><button class="big" data-act="sheet" data-v="zahod">Заход<small>начало строки</small></button><button class="big" data-act="sheet" data-v="rhythm"' + (can ? '' : ' disabled') + '>Ритм<small>отстучать строку</small></button><button class="big" data-act="starmore"' + (l.t ? '' : ' disabled') + '>' + (l.star ? '★ Годное' : '☆ Годное') + '<small>отметить строку</small></button>' +
      '<button class="big" data-act="sheet" data-v="ask">Спросить у ИИ<small>готовый запрос</small></button><button class="big" data-act="beatopen">Бит и метроном<small>темп, бит под текстом</small></button><button class="big" data-act="fragcur">Мысль<small>двигать, склеить, в запас</small></button></div>'); }
  else if (k === 'menu') L.innerHTML = sheet(esc(titleOf(t)), '',
      '<button class="btn big" data-act="copytext">Скопировать весь текст</button>' + (t.lines.some(l => cleanText(l.t) !== l.t) ? '<button class="btn big" data-act="copyclean">Скопировать чисто, без растяжек и ударений</button>' : '') + '<button class="btn big" data-act="new">＋ Новый текст</button>' +
      (curLine() ? '<button class="btn big" data-act="delline">Удалить строку ' + (S.cur + 1) + '</button>' : '') + '<button class="btn big danger" data-act="deltext">Удалить текст</button>');
  else if (k === 'confirmdel') L.innerHTML = sheet('Удалить текст?', 'это нельзя отменить, если нет сохранённой копии', '<button class="btn big danger" data-act="deltextyes">Да, удалить</button><button class="btn big" data-act="close">Отмена</button>');
}

// --- запрос для ИИ ---
function buildPrompt(t){
  const L = t.lines[S.cur]; let base = null, goal = '';
  if (L && goalOf(L)) { goal = goalOf(L); base = t.lines.slice(0, S.cur).filter(x => x.t && !goalOf(x)).slice(-1)[0] || null; } else if (L && L.t) base = L;
  else base = t.lines.slice(0, S.cur).filter(x => x.t && !goalOf(x)).slice(-1)[0] || null;
  const line = base ? base.t : '';
  let p = 'Ты соавтор рэп-текстов. Помоги продолжить строку.\n';
  const above = t.lines.slice(0, base ? t.lines.indexOf(base) : S.cur).filter(x => x.t).map(x => x.t);
  if (above.length) p += 'Текст выше: ' + above.join(' / ') + '\n';
  if (line) p += 'Строка: ' + line + '\n';
  if (t.thoughts.length) p += 'Мысли к тексту: ' + t.thoughts.join('; ') + '\n';
  if (goal) p += 'Следующая строка должна закончиться словом: ' + goal + '\n';
  if (base) { const n = base.ry || syl(base.t); p += 'Размер: около ' + n + ' ' + sl(n);
    if (base.taps) { const lf = longFlags(base.taps), st = base.strong || []; p += ', рисунок: ' + base.taps.map((x, i) => st.includes(i) ? 'ТА' : lf[i] ? 'та-а' : 'та').join('-'); }
    p += '\n'; }
  if (t.box.length) p += 'Слова под рукой: ' + t.box.join(', ') + '\n';
  p += (line ? 'Напиши 8 вариантов следующей строки' : 'Напиши 8 вариантов первой строки из этих мыслей') + ': разговорный русский, конкретные предметы и действия, без пафоса и штампов. Только строки, каждая с новой строки, без нумерации и пояснений.';
  return p;
}
const parseAnswer = raw => raw.split(/\r?\n/).map(x => x.replace(/^\s*(\d+[.)]|[-—•*])\s*/, '').replace(/^["«„“]+|["»“”]+$/g, '').replace(/\*\*/g, '').trim())
  .filter(x => x.length > 2 && !/^(вот|конечно|варианты|надеюсь)/i.test(x) && !/[:：]\s*$/.test(x));

async function copyText(txt){ try { await navigator.clipboard.writeText(txt); return true; } catch {
  const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
  const ok = document.execCommand('copy'); ta.remove(); return ok; } }

// --- колода: свайпы ---
function bindSwipe(right = 'nextdeck', left = 'dropdeck', up = 'takedeck'){ const c = $('#card'); if (!c) return; let x0, y0, on = false;
  c.addEventListener('pointerdown', e => { on = true; x0 = e.clientX; y0 = e.clientY; c.classList.add('drag'); c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', e => { if (!on) return; c.style.transform = 'translate(' + (e.clientX - x0) + 'px,' + Math.min(0, e.clientY - y0) + 'px) rotate(' + ((e.clientX - x0) / 20) + 'deg)'; });
  const upH = e => { if (!on) return; on = false; c.classList.remove('drag'); const dx = e.clientX - x0, dy = e.clientY - y0; c.style.transform = '';
    if (up && dy < -80 && Math.abs(dy) > Math.abs(dx)) act(up); else if (dx > 80) act(right); else if (dx < -80) act(left); };
  const upAlias = upH;
  c.addEventListener('pointerup', upAlias); c.addEventListener('pointercancel', () => { on = false; c.style.transform = ''; }); }

// --- отстук ---
let down = 0;
function bindPad(){ const p = $('#pad'); if (!p) return;
  p.addEventListener('pointerdown', e => { e.preventDefault(); down = performance.now(); p.classList.add('hit'); });
  const up = () => { if (!down) return; S.sd.taps = S.sd.taps || []; S.sd.taps.push([down, performance.now() - down]); down = 0; p.classList.remove('hit'); drawTaps(); };
  p.addEventListener('pointerup', up); p.addEventListener('pointerleave', up); p.addEventListener('pointercancel', up); }
function drawTaps(){ const tr = $('#track'), c = $('#count'); if (!tr) return; const taps = S.sd.taps || [], st = S.sd.strong || [];
  tr.innerHTML = ''; const n = taps.length; if (!n) { c.innerHTML = '0 слогов<small>пока ничего не отстучал</small>'; return; }
  const t0 = taps[0][0], end = taps[n - 1][0] + taps[n - 1][1], span = Math.max(end - t0, 1), lf = longFlags(taps);
  taps.forEach((x, i) => { const s = document.createElement('span'); s.className = 'seg2' + (lf[i] ? ' long' : '') + (st.includes(i) ? ' str' : '');
    s.style.left = ((x[0] - t0) / span * 94 + 3) + '%'; if (lf[i]) s.style.width = Math.max(18, x[1] / span * 280) + 'px'; s.dataset.act = 'strong'; s.dataset.v = i; tr.appendChild(s); });
  c.innerHTML = n + ' ' + sl(n) + '<small>' + (lf.filter(Boolean).length ? 'протяжных: ' + lf.filter(Boolean).length : 'все короткие') + (st.length ? ' · сильных: ' + st.length : '') + '</small>'; }

// ---------- напевы ----------
const MIC = '<svg class="mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>';
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, a, b, c) => { const x = n % 10, y = n % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; };
const KINDS = ['мелодия', 'ритмика', 'флоу', 'припев'];
const humName = m => m.name || (m.line ? '«' + (m.line.length > 30 ? m.line.slice(0, 29) + '…' : m.line) + '»' : 'Напев ' + new Date(m.created).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }));
const waveSVG = m => { const a = m.peaks || [], n = a.length || 1, top = Math.max(12, ...a); return '<svg class="wave" viewBox="0 0 ' + n * 4 + ' 40" preserveAspectRatio="none" data-wave="' + m.id + '">' + a.map((x, i) => { const h = Math.max(2, x / top * 38); return '<rect x="' + (i * 4) + '" y="' + (20 - h / 2).toFixed(1) + '" width="2.6" height="' + h.toFixed(1) + '" rx="1.2"/>'; }).join('') + '</svg>'; };
const playBtn = (id, cls) => '<button class="' + cls + (playing() === id ? ' on' : '') + '" data-act="humplay" data-v="' + id + '"><i>' + (playing() === id ? '■' : '▶') + '</i>';
const humChips = list => list.map(m => '<span class="hum">' + playBtn(m.id, 'hp') + '<span>' + esc(humName(m)) + '</span><small>' + mmss(m.dur) + '</small></button><button class="hm" data-act="humopen" data-v="' + m.id + '">⋯</button></span>').join('');
const humRow = t => { const l = takesOf(t.id); if (l.length) warm(l.map(m => m.id)); return '<div id="humrow" class="humrow">' + humChips(l) + '</div>'; };
function drawHumRow(){ const r = $('#humrow'), t = T(); if (r && t) { const l = takesOf(t.id); warm(l.map(m => m.id)); r.innerHTML = humChips(l); } }
function humsHTML(){ const f = S.humK || '', all = takes(), l = all.filter(m => !f || m.kind === f); if (l.length) warm(l.map(m => m.id));
  const used = KINDS.filter(k => all.some(m => m.kind === k)), size = all.reduce((n, m) => n + (m.size || 0), 0) / 1048576;
  return '<div class="muted" style="margin:0 2px 8px">Мелодии и ритмика голосом. Лежат только в этом телефоне.</div><div class="row" style="margin-bottom:10px"><button class="btn main" data-act="rec">' + MIC + 'Напеть</button>' + (all.length ? '<button class="btn" data-act="humall">Сохранить все файлами</button>' : '') + '</div>' +
    (used.length ? '<div class="zgs">' + [''].concat(used).map(k => '<button data-act="humk" data-v="' + k + '" class="' + (f === k ? 'on' : '') + '">' + (k || 'все') + '</button>').join('') + '</div>' : '') +
    (l.length ? l.map(m => { const tx = texts.get(m.textId); return '<div class="humitem">' + playBtn(m.id, 'hb') + '</button><button class="humt" data-act="humopen" data-v="' + m.id + '"><b>' + esc(humName(m)) + '</b><small>' + mmss(m.dur) + (m.kind ? ' · ' + m.kind : '') + ' · ' + fmtDate(m.created) + (tx ? ' · ' + esc(titleOf(tx).slice(0, 26)) : '') + '</small>' + waveSVG(m) + '</button></div>'; }).join('') : '<div class="empty">Напевов пока нет</div>') +
    (all.length ? '<div class="muted" style="margin:6px 2px 0">' + all.length + ' ' + plural(all.length, 'напев', 'напева', 'напевов') + ' · ' + (size < .1 ? 'меньше 0,1' : size.toFixed(1).replace('.', ',')) + ' МБ. В «Сохранить копию» попадают только тексты, звук сохраняй файлами.</div>' : ''); }
let recT = null;
function humSheet(k, d, L){
  if (k === 'rec') { const t = S.view === 'text' ? T() : null; let lines = []; if (t && t.lines.length) { const [a, b] = fragOf(t.lines, Math.min(S.cur, t.lines.length - 1)); lines = t.lines.slice(a, b + 1).filter(l => l.t.trim()).slice(0, 12); }
    L.innerHTML = sheet('Запись', d.err ? '' : d.under ? 'под ' + (d.under === 'beat' ? 'бит' : 'метроном') + ': надень наушники' : 'пой, стучи, бубни: сохранится само', d.err ? '<div class="empty">' + esc(d.err) + '</div><button class="btn big" data-act="recoff">Закрыть</button>' :
      (lines.length ? '<div class="reclines">' + lines.map(l => esc(l.t)).join('<br>') + '</div>' : '') + '<div class="recbox"><div class="rect" id="rect">0:00</div><div class="recw" id="recw"></div><button class="recstop" data-act="recstop" aria-label="Стоп"><i></i></button><div class="muted">' + (d.wait ? 'жду микрофон…' : 'нажми, чтобы закончить') + '</div></div><button class="btn big ghost" data-act="recoff">Не сохранять</button>');
    return true; }
  if (k === 'hum') { const m = takeBy(d.id); if (!m) { S.sheet = null; L.innerHTML = ''; return true; } warm([m.id]); const tx = texts.get(m.textId), here = S.view === 'text' ? T() : null;
    L.innerHTML = sheet(esc(humName(m)), mmss(m.dur) + ' · ' + fmtDate(m.created) + (tx ? ' · ' + esc(titleOf(tx).slice(0, 30)) : ''),
      '<button class="wavebox" data-v="' + m.id + '">' + waveSVG(m) + '</button><div class="row" style="flex-wrap:nowrap;margin-bottom:12px">' + playBtn(m.id, 'btn main humbig') + '<span class="pt">' + (playing() === m.id ? 'Стоп' : 'Слушать') + '</span></button><button class="btn humbig' + (S.humLoop ? ' lon' : '') + '" data-act="humloop">↻ по кругу</button></div>' + (beats().some(x => x.id === m.beatId) ? '<button class="btn big" style="margin:-4px 0 12px" data-act="humbeat">▶ Слушать вместе с битом</button>' : '') +
      '<input class="f" id="humname" placeholder="название" value="' + esc(m.name) + '" autocapitalize="sentences"><div class="chips" style="margin:10px 0">' + KINDS.map(x => '<button class="chip rh' + (m.kind === x ? ' in' : '') + '" data-act="humkind" data-v="' + x + '">' + x + '</button>').join('') + '</div>' +
      (m.line ? '<div class="muted" style="margin:0 2px 8px">к строке «' + esc(m.line) + '»</div>' : '') +
      (here && m.textId !== here.id ? '<button class="btn big" data-act="humlink">Прикрепить к этому тексту</button>' : '') + (tx && !here ? '<button class="btn big" data-act="open" data-v="' + tx.id + '">Открыть текст</button>' : !tx ? '<button class="btn big" data-act="humnew">Начать текст под этот напев</button>' : '') +
      (tx && here && m.textId === here.id ? '<button class="btn big" data-act="humunlink">Открепить от текста</button>' : '') +
      '<button class="btn big" data-act="humfile">Сохранить или отправить файл</button><button class="btn big" data-act="rec">' + MIC + 'Записать ещё дубль</button><button class="btn big danger" data-act="humdel">Удалить</button>');
    const inp = $('#humname'); inp.addEventListener('change', () => { m.name = inp.value.trim(); putTake(m).then(() => { drawHumRow(); const st = document.querySelector('.sheet .st'); if (st && S.sheet === 'hum') st.textContent = humName(m); }); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); }); tickHum(); return true; }
  return false; }
async function recBegin(){
  if (recOn()) return; const f = document.activeElement; if (f && f.blur) f.blur(); S.sheet = 'rec'; S.sd = { wait:true }; renderSheet();
  if (!recSupported()) { S.sd = { err:'Этот браузер не умеет записывать звук' }; renderSheet(); return; }
  const under = beatState().on; holdBeat(true);
  try { await startRec(); if (under) { wakeBeat(); setTimeout(wakeBeat, 250); } if (S.sheet !== 'rec') { await stopRec({}, false); return; } S.sd = { under }; renderSheet(); clearInterval(recT); recT = setInterval(drawRec, 90);
    setTimeout(() => { const p = beatPos(), s = beatState(); if (recOn()) REC_AT = s.on === 'beat' && p !== null ? { beatId:s.id, beatAt:p - recState().ms / 1000, bpm:s.bpm } : s.on === 'metro' ? { bpm:s.bpm } : {}; }, 600); REC_AT = {}; }
  catch (e) { holdBeat(false); if (S.sheet !== 'rec') return; S.sd = { err:/NotAllowed|Permission|denied/i.test(e.name + e.message) ? 'Нет доступа к микрофону. Разреши его для «Строк» и открой приложение заново.' : 'Микрофон не включился: ' + e.message }; renderSheet(); } }
function drawRec(){ const s = recState(), a = $('#rect'), w = $('#recw'); if (!s.on) { clearInterval(recT); return; } if (a) a.textContent = mmss(Math.floor(s.ms / 1000) * 1000); if (w) w.innerHTML = s.peaks.slice(-46).map(x => '<i style="height:' + Math.max(3, x * .46) + 'px"></i>').join(''); }
let recEnd = false, REC_AT = {};
async function recFinish(keep = true){
  if (recEnd) return; recEnd = true; clearInterval(recT);
  try { const t = S.view === 'text' ? T() : null, l = t ? baseLine(t) : null, was = recOn(); let m = null;
    try { m = await stopRec({ ...REC_AT, ...(t ? { textId:t.id, line:l ? l.t.trim().slice(0, 90) : '' } : {}) }, keep); } catch (e) { toast('Не сохранилось: ' + e.message); }
    holdBeat(false); if (beatState().on) stopBeat();
    S.sheet = m ? 'hum' : null; S.sd = m ? { id:m.id } : {}; render(); if (m) toast('Напев сохранён'); else if (keep && was) toast('Запись слишком короткая'); } finally { recEnd = false; } }
onRecAuto(() => recFinish());
document.addEventListener('visibilitychange', () => { if (document.hidden && recOn()) recFinish(); });
function tickHum(){ document.querySelectorAll('[data-wave]').forEach(w => { const on = playing() === w.dataset.wave, p = on ? playPos() : 0, rs = w.children, n = rs.length; for (let i = 0; i < n; i++) rs[i].classList.toggle('pl', on && i / n <= p); }); }
let humT = null;
onHum(() => { const id = playing(); if (!id && S.withBeat) { S.withBeat = false; stopBeat(); } clearInterval(humT); if (id) humT = setInterval(tickHum, 120); tickHum();
  document.querySelectorAll('[data-act="humplay"]').forEach(b => { const on = b.dataset.v === id; b.classList.toggle('on', on); const i = b.querySelector('i'), p = b.querySelector('.pt'); if (i) i.textContent = on ? '■' : '▶'; if (p) p.textContent = on ? 'Стоп' : 'Слушать'; }); });
async function shareFiles(files){ if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }); toast('Сохранено файлов: ' + files.length); }
function humAct(a, v){
  const m = S.sheet === 'hum' ? takeBy(S.sd.id) : null;
  switch (a) {
    case 'rec': recBegin(); return true;
    case 'recstop': if (recOn()) recFinish(); return true;
    case 'recoff': if (recOn()) recFinish(false); else { S.sheet = null; S.sd = {}; render(); } return true;
    case 'humplay': togglePlay(v, S.humLoop).catch(e => toast('Не играет: ' + e.message)); return true;
    case 'humbeat': if (m) { const b = beats().find(x => x.id === m.beatId); if (b) { S.withBeat = true; const p1 = startBeat(b, Math.max(0, m.beatAt || 0)), p2 = togglePlay(m.id, false); Promise.all([p1, p2]).catch(e => toast('Не играет: ' + e.message)); } } return true;
    case 'humopen': { const f = document.activeElement; if (f && f.blur) f.blur(); S.sheet = 'hum'; S.sd = { id:v }; renderSheet(); return true; }
    case 'humk': S.humK = v; render(); return true;
    case 'humloop': S.humLoop = !S.humLoop; setLoop(S.humLoop); renderSheet(); return true;
    case 'humkind': if (m) { m.kind = m.kind === v ? '' : v; putTake(m).then(() => { if (S.view !== 'text' && S.tab === 'notes') render(); else renderSheet(); }); } return true;
    case 'humlink': if (m) { m.textId = S.id; putTake(m).then(() => { drawHumRow(); renderSheet(); toast('Прикреплено'); }); } return true;
    case 'humunlink': if (m) { m.textId = ''; m.line = ''; putTake(m).then(() => { drawHumRow(); renderSheet(); }); } return true;
    case 'humnew': if (m) { const n = newText({ title:m.name || '', lines:[{ t:'', strong:[] }] }); m.textId = n.id; putTake(m).then(() => openText(n.id, 0, 'write')); } return true;
    case 'humfile': if (m) fileOf(m.id).then(f => shareFiles([f])).catch(e => toast('Не получилось: ' + e.message)); return true;
    case 'humall': Promise.all(takes().map(x => fileOf(x.id))).then(shareFiles).catch(e => toast('Не получилось: ' + e.message)); return true;
    case 'humdel': if (m) dropTake(m.id).then(x => { S.sheet = null; S.sd = {}; render(); toastUndo('Напев удалён', () => putTake(x.meta, x.buf).then(render)); }); return true;
  }
  return false; }
document.addEventListener('click', e => { const b = e.target.closest('.wavebox'); if (!b) return; const r = b.getBoundingClientRect(), f = (e.clientX - r.left) / r.width, id = b.dataset.v; if (playing() === id) seek(id, f); else togglePlay(id, S.humLoop).then(() => seek(id, f)).catch(() => {}); });

// ---------- бит и метроном ----------
const beatOf = t => t && t.beatId ? beats().find(b => b.id === t.beatId) || null : null;
const fmtBpm = x => x ? String(x).replace('.', ',') : '—';
const DOTS = '<span class="dots"><i></i><i></i><i></i><i></i></span>';
function beatBar(t){ const b = beatOf(t); if (b) warm([b.id]); return '<div id="beatbar">' + beatBarIn(t) + '</div>'; }
function beatBarIn(t){ const b = beatOf(t), s = beatState(); if (!b && !t.bpm && s.on !== 'metro') return ''; const on = b ? s.on === 'beat' && s.id === b.id : s.on === 'metro';
  return '<div class="bbar"><button class="hb' + (on ? ' on' : '') + '" data-act="beatplay"><i>' + (on ? '■' : '▶') + '</i></button><button class="bbt" data-act="beatopen"><b>' + esc(b ? b.name : 'Метроном') + '</b><small>' + fmtBpm(b ? b.bpm : t.bpm || s.bpm) + ' BPM</small></button>' + DOTS + '<button class="hm" data-act="beatopen">⋯</button></div>'; }
function drawBeatBar(){ const e = $('#beatbar'), t = T(); if (e && t) e.innerHTML = beatBarIn(t); }
function beatSheet(k, d, L){
  if (k !== 'beat') return false; const t = S.view === 'text' ? T() : null, s = beatState(), all = beats(), mine = beatOf(t), b = mine || (s.on === 'beat' ? all.find(x => x.id === s.id) : null);
  d.tab = d.tab || (b ? 'beat' : 'metro'); const metro = d.tab === 'metro', bpm = metro ? (t && t.bpm && s.on !== 'metro' ? t.bpm : s.on === 'metro' ? s.bpm : S.bpm || (t && t.bpm) || 90) : b ? b.bpm : 0, on = metro ? s.on === 'metro' : !!(b && s.on === 'beat' && s.id === b.id); if (all.length) warm(all.map(x => x.id));
  const tempo = '<div class="bpmrow"><button class="btn" data-act="bpm" data-v="-1">−</button><div class="bpmv"><b id="bpmv">' + fmtBpm(bpm) + '</b><small>BPM</small></div><button class="btn" data-act="bpm" data-v="1">+</button></div><div class="row" style="justify-content:center;margin-bottom:10px"><button class="btn" data-act="bpm" data-v="x.5">÷2</button>' + DOTS + '<button class="btn" data-act="bpm" data-v="x2">×2</button></div>' +
    '<button class="tpad" id="tpad">Стучи в такт<small id="tcount">' + (metro ? 'от четырёх ударов' : on ? 'начни с «раз»' : 'включи бит и стучи, начни с «раз»') + '</small></button>';
  L.innerHTML = sheet('Бит и метроном', t ? 'к тексту «' + esc(titleOf(t).slice(0, 30)) + '»' : '', '<div class="seg"><button data-act="btab" data-v="metro" class="' + (metro ? 'on' : '') + '">Метроном</button><button data-act="btab" data-v="beat" class="' + (metro ? '' : 'on') + '">Бит</button></div>' +
    (metro ? tempo + '<button class="btn big main" data-act="metro">' + (on ? '■ Стоп' : '▶ Метроном') + '</button><div class="muted" style="margin:12px 0 7px">Звук</div><div class="chips">' + WOODS.map(([k2, n]) => '<button class="chip rh' + (s.wood === k2 ? ' in' : '') + '" data-act="wood" data-v="' + k2 + '">' + n + '</button>').join('') + '</div><div class="muted" style="margin-top:12px">Громкость щелчка</div><input type="range" id="bvol" min="0.1" max="1" step="0.05" value="' + s.vol + '">' + (t && t.bpm && !mine ? '<button class="btn big" data-act="bpmoff">Убрать темп с этого текста</button>' : '')
      : (b ? '<div class="bname">' + esc(b.name) + '<small>' + mmss(b.dur) + '</small></div><input type="range" id="bpos" min="0" max="1000" value="0">' + tempo + '<div class="row" style="flex-wrap:nowrap;margin-top:10px"><button class="btn main humbig" data-act="beatgo" data-v="' + b.id + '">' + (on ? '■ Стоп' : '▶ Бит') + '</button><button class="btn humbig' + (s.click ? ' lon' : '') + '" data-act="beatclick">щелчок поверх</button></div>' + (mine ? '<button class="btn big" data-act="beatnone">Убрать бит с этого текста</button>' : '') : '') +
        '<div class="grp">Мои биты</div>' + (all.length ? all.map(x => '<div class="humitem">' + '<button class="hb' + (s.on === 'beat' && s.id === x.id ? ' on' : '') + '" data-act="beatgo" data-v="' + x.id + '"><i>' + (s.on === 'beat' && s.id === x.id ? '■' : '▶') + '</i></button><button class="humt" data-act="beatpick" data-v="' + x.id + '"><b>' + esc(x.name) + '</b><small>' + mmss(x.dur) + ' · ' + fmtBpm(x.bpm) + ' BPM' + (t && t.beatId === x.id ? ' · в этом тексте' : t ? ' · нажми, чтобы взять' : '') + '</small></button><button class="hm" data-act="beatdel" data-v="' + x.id + '">✕</button></div>').join('') : '<div class="empty">Битов пока нет</div>') +
        '<button class="btn big' + (all.length ? '' : ' main') + '" data-act="beatadd">Загрузить бит из «Файлов»</button>'));
  const v = $('#bvol'); if (v) v.addEventListener('input', () => setVol(+v.value)); const p = $('#bpos'); if (p) { p.addEventListener('input', () => { p.dataset.drag2 = '1'; }); p.addEventListener('change', () => { seekBeat(p.value / 1000); delete p.dataset.drag2; }); }
  const pad = $('#tpad'); if (pad) pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 90); if (!metro && !on) { $('#tcount').textContent = 'сначала включи бит'; return; } if (metro && beatState().on === 'metro') stopBeat();
    const r = tap(performance.now()); $('#tcount').textContent = r.bpm ? 'ударов: ' + r.n : 'ещё ' + (4 - r.n); if (!r.bpm) return; applyBpm(r.bpm, r.off, metro, b); });
  return true; }
function applyBpm(x, off, metro, b){ const t = S.view === 'text' ? T() : null; x = setBpm(x); const e = $('#bpmv'); if (e) e.textContent = fmtBpm(x);
  if (metro) { S.bpm = x; if (t) { t.bpm = x; save(t); } } else if (b) { b.bpm = x; if (off !== null && off !== undefined) b.off = off; putTake(b); }
  drawBeatBar(); }
function beatsHTML(){ const all = beats(), s = beatState(); if (all.length) warm(all.map(x => x.id)); return '<div class="grp">Биты</div>' + all.map(x => '<div class="humitem"><button class="hb' + (s.on === 'beat' && s.id === x.id ? ' on' : '') + '" data-act="beatgo" data-v="' + x.id + '"><i>' + (s.on === 'beat' && s.id === x.id ? '■' : '▶') + '</i></button><span class="humt"><b>' + esc(x.name) + '</b><small>' + mmss(x.dur) + ' · ' + fmtBpm(x.bpm) + ' BPM</small></span><button class="hm" data-act="beatdel" data-v="' + x.id + '">✕</button></div>').join('') + '<div class="row"><button class="btn" data-act="beatadd">Загрузить бит</button><button class="btn" data-act="beatopen">Метроном и темп</button></div>'; }
async function addBeat(f){
  if (f.size > 120e6) { toast('Файл больше 120 МБ, возьми mp3'); return; } const buf = await f.arrayBuffer(), mime = f.type || (/\.wav$/i.test(f.name) ? 'audio/wav' : /\.(m4a|aac|mp4)$/i.test(f.name) ? 'audio/mp4' : 'audio/mpeg');
  const dur = await new Promise(res => { const a = new Audio(), u = URL.createObjectURL(new Blob([buf], { type:mime })); let end = false; const fin = x => { if (end) return; end = true; URL.revokeObjectURL(u); res(x); }; a.onloadedmetadata = () => fin(a.duration); a.onerror = () => fin(-1); setTimeout(() => fin(0), 6000); a.preload = 'metadata'; a.src = u; a.load(); });
  if (dur < 0) { toast('Этот файл телефон не играет'); return; }
  const name = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 60) || 'Бит', g = name.match(/(?:^|\D)(\d{2,3}(?:[.,]\d)?)\s*bpm/i);
  const meta = { id:uid(), type:'beat', name, bpm:g ? Math.max(40, Math.min(240, +g[1].replace(',', '.'))) : 0, off:0, dur:isFinite(dur) ? Math.round(dur * 1000) : 0, mime, size:buf.byteLength, created:Date.now() };
  await putTake(meta, buf); await warm([meta.id]); const t = S.view === 'text' ? T() : null; if (t) { t.beatId = meta.id; save(t); drawBeatBar(); } S.sd.tab = 'beat'; if (S.sheet === 'beat') renderSheet(); else render(); toast(g ? 'Бит добавлен, ' + fmtBpm(meta.bpm) + ' BPM из названия' : 'Бит добавлен, отстучи темп'); }
onBeat(() => { drawBeatBar(); beatTick(); if (S.sheet === 'beat') renderSheet(); else document.querySelectorAll('[data-act="beatgo"]').forEach(x => { const s = beatState(), on = s.on === 'beat' && s.id === x.dataset.v; x.classList.toggle('on', on); const i = x.querySelector('i'); if (i) i.textContent = on ? '■' : '▶'; }); }, m => toast('Не играет: ' + m));
let beatT = null;
function beatTick(){ clearInterval(beatT); if (beatState().on) beatT = setInterval(beatDraw, 40); else beatDraw(); }
function beatDraw(){ const p = beatPhase(); document.querySelectorAll('.dots').forEach(d => { if (d.dataset.p === String(p)) return; d.dataset.p = p; [...d.children].forEach((x, i) => x.classList.toggle('on', i === p)); });
  const r = $('#bpos'), n = beatDur(), x = beatPos(); if (r && n && x !== null && !r.dataset.drag2) r.value = x / n * 1000; }
document.addEventListener('visibilitychange', () => { if (document.hidden && beatState().on === 'metro') stopBeat(); });
function beatAct(a, v){
  const t = S.view === 'text' ? T() : null, s = beatState(), blur = () => { const f = document.activeElement; if (f && f.blur) f.blur(); }, go = b => startBeat(b).catch(e => toast('Не играет: ' + e.message));
  switch (a) {
    case 'back': case 'tab': if (s.on) stopBeat(); return false;
    case 'beatopen': blur(); tapReset(); S.sheet = 'beat'; S.sd = {}; renderSheet(); return true;
    case 'btab': if (s.on) stopBeat(); tapReset(); S.sd.tab = v; renderSheet(); return true;
    case 'beatplay': { const b = beatOf(t); if (s.on) { stopBeat(); return true; } stopPlay(); if (b) go(b); else startMetro(t.bpm || 90); return true; }
    case 'metro': if (s.on === 'metro') stopBeat(); else { stopPlay(); const x = (t && t.bpm) || S.bpm || 90; if (t && !t.bpm) { t.bpm = x; save(t); } startMetro(x); } return true;
    case 'beatgo': { const b = beats().find(x => x.id === v); if (!b) return true; if (s.on === 'beat' && s.id === v) stopBeat(); else { stopPlay(); go(b); } return true; }
    case 'wood': setWood(v, true); kvSet('wood', v); renderSheet(); return true;
    case 'beatpick': { const b = beats().find(x => x.id === v); if (b && t) { t.beatId = v; save(t); drawBeatBar(); } if (b && !(s.on === 'beat' && s.id === v)) go(b); else renderSheet(); return true; }
    case 'beatnone': if (t) { t.beatId = ''; save(t); if (s.on) stopBeat(); drawBeatBar(); renderSheet(); } return true;
    case 'bpmoff': if (t) { t.bpm = 0; save(t); if (s.on) stopBeat(); drawBeatBar(); renderSheet(); } return true;
    case 'bpm': { const metro = S.sd.tab === 'metro', b = metro ? null : beatOf(t) || (s.on === 'beat' ? beats().find(x => x.id === s.id) : null), cur = metro ? (s.on === 'metro' ? s.bpm : (t && t.bpm) || S.bpm || 90) : b ? b.bpm || 90 : 90; applyBpm(v[0] === 'x' ? cur * +v.slice(1) : Math.round(cur) + +v, null, metro, b); return true; }
    case 'beatclick': setClick(!s.click); if (!s.click && S.sheet === 'beat') { const b = beatOf(t) || beats().find(x => x.id === s.id); if (b && !b.bpm) toast('Сначала отстучи темп'); } renderSheet(); return true;
    case 'beatadd': { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.wav,.m4a,.aac'; inp.onchange = () => { if (inp.files[0]) addBeat(inp.files[0]).catch(e => toast('Не получилось: ' + e.message)); }; inp.click(); return true; }
    case 'beatdel': { const b = beats().find(x => x.id === v); if (!b) return true; if (s.id === v && s.on) stopBeat(); dropTake(v).then(x => { drawBeatBar(); if (S.sheet) renderSheet(); else render(); toastUndo('Бит удалён', () => putTake(x.meta, x.buf).then(() => { drawBeatBar(); if (S.sheet) renderSheet(); else render(); })); }); return true; }
  }
  return false; }

// ---------- действия ----------
function openText(id, line, mode){ S.back = S.tab; S.view = 'text'; S.id = id; S.lastText = id; const t = T(); S.cur = line ?? Math.max(0, t.lines.length - 1); S.edit = null; S.sheet = null; S.mode = mode || 'write'; if (S.mode === 'write') S.focusTA = true; render(); $('#main').scrollTop = 0; }
function closeSheet(){ if (S.sheet === 'rec' && recOn()) { recFinish(); return; } S.sheet = null; S.sd = {}; if (S.refocus && S.view === 'text' && S.mode === 'write') { S.focusTA = true; } S.refocus = false; render(); }
function act(a, v, el){
  if (dictAct(a, v)) return;
  if (lookAct(a, v)) return;
  if (humAct(a, v) || beatAct(a, v)) return;
  const t = T();
  switch (a) {
    case 'tab': flushAll(); if (v === 'dict' && S.tab === 'dict') { D.blk = null; D.open = null; } S.tab = v; S.view = 'home'; S.sheet = null; render(); break;
    case 'new': { const n = newText({ lines:[{ t:'', strong:[] }] }); openText(n.id, 0, 'write'); break; }
    case 'mode': { if (S.edit !== null) saveEdit(false); S.mode = v; if (v === 'write') { S.focusTA = true; const tt2 = T(); S.caret = tt2.lines.slice(0, S.cur + 1).map(l => l.t).join(String.fromCharCode(10)).length; } render(); break; }
    case 'open': { const li = el?.dataset.i !== undefined ? +el.dataset.i : undefined; if (li !== undefined) { const tx = texts.get(v); S.caret = tx ? tx.lines.slice(0, li + 1).map(l => l.t).join('\n').length : null; } openText(v, li); break; }
    case 'back': flushAll(); S.view = 'home'; S.tab = S.back || 'write'; S.edit = null; render(); break;
    case 'seg': S.seg = v; render(); break;
    case 'sheet': if (S.edit !== null) saveEdit(false); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); S.sheet = v; S.sd = {}; render(); break;
    case 'starmore': { const l = curLine(); if (l) { l.star = !l.star; save(t); } closeSheet(); toast(l && l.star ? 'Отмечено ★' : 'Снял ★'); break; }
    case 'close': closeSheet(); break;
    case 'otherq': S.sd.q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]; renderSheet(); break;
    case 'nothingdone': { const a1 = $('#ans').value.trim(); if (!a1) { toast('Ответь хоть парой слов'); break; } const c = D.cards[S.sd.ci];
      const n = newText({ thoughts:['Слово: ' + c.word + '. ' + S.sd.q + ' — ' + a1], box:[c.word] }); S.sheet = null; S.sd = {}; openText(n.id); break; }
    case 'otherword': { const c = dayContent(0, Math.floor(Math.random() * 1e6)).word; S.sd.ci = D.byId.get(c.id); renderSheet(); break; }
    case 'nothingwrite': { const c = D.cards[S.sd.ci]; const n = newText({ thoughts:['Слово: ' + c.word + ' — ' + shortOf(c)], box:[c.word] }); S.sheet = null; S.sd = {}; openText(n.id); break; }
    case 'wordnext': { const a1 = $('#ans').value.trim(); if (!a1) break; S.sd.w = a1; renderSheet(); break; }
    case 'wtab': S.sd.tab = v; renderSheet(); break;
    case 'wbox': { const b = S.sd.box, k = b.indexOf(v); if (k >= 0) b.splice(k, 1); else b.push(v); renderSheet(); break; }
    case 'zgrp': S.sd.zg = v; S.sd.order = null; S.sd.ranked = false; renderSheet(); break;
    case 'zskip': { const c = D.cards[S.sd.order[S.sd.i % S.sd.order.length]]; D.zseen = D.zseen || {}; D.zseen[c.word] = Date.now(); kvSet('zseen', D.zseen); S.sd.i++; renderSheet(); break; }
    case 'ztake': { const z = D.cards[S.sd.order[S.sd.i % S.sd.order.length]].word, L = curLine(); let li, cp = z.length + 1;
      if (!t.lines.length) { t.lines = [{ t:z + ' ', strong:[] }]; li = 0; }
      else if (L && !L.t.trim()) { L.t = z + ' '; li = S.cur; }
      else if (L && goalOf(L)) { L.goal = undefined; L.t = z + ' ' + L.t; li = S.cur; }
      else { t.lines.splice(S.cur + 1, 0, { t:z + ' ', strong:[] }); li = S.cur + 1; }
      S.cur = li; save(t); S.sheet = null; S.sd = {};
      if (S.mode === 'write') { S.focusTA = true; S.caret = (li ? t.lines.slice(0, li).map(l => l.t).join(String.fromCharCode(10)).length + 1 : 0) + cp; } else S.edit = li;
      render(); break; }
    case 'feedword': case 'feedphrase': case 'feedtheme': { const c = dayContent(0, S.feedN || 0);
      let n; if (a === 'feedword') n = newText({ thoughts:['Слово дня: ' + c.word.word + ' — ' + shortOf(c.word)], box:[c.word.word] });
      else if (a === 'feedphrase') n = newText({ thoughts:['Фраза дня: ' + c.phrase.word + ' — ' + shortOf(c.phrase)], box:[c.phrase.word] });
      else { n = newText({ thoughts:['Тема дня (' + c.theme.type + '): ' + c.theme.text + (c.theme.hint ? ' — ' + c.theme.hint : '')] }); startTimer(n.id); }
      openText(n.id); break; }
    case 'feedpast': { const c = dayContent(+v); const n = newText({ thoughts:['Тема (' + c.theme.type + '): ' + c.theme.text, 'Слово: ' + c.word.word + ' — ' + shortOf(c.word)], box:[c.word.word] }); openText(n.id); break; }
    case 'feedmore': S.feedN = (S.feedN || 0) + 1; render(); break;
    case 'feedreset': S.feedN = 0; render(); break;
    case 'feedrhyme': S.tab = 'dict'; D.blk = null; D.open = null; D.q = lastWordOf(v) || v; runSearch(false); break;
    case 'feedcard': { const c = D.cards[D.byId.get(v)]; S.tab = 'dict'; D.q = ''; D.blk = c.b; D.open = v; render(); setTimeout(() => { const e = document.querySelector('[data-act="dopen"][data-v="' + v + '"]'); if (e) e.scrollIntoView({ block:'center' }); }, 30); break; }
    case 'timerstop': clearInterval(timerIv); S.timerEnd = null; render(); toast('Таймер остановлен'); break;
    case 'worddone': { const n = newText({ thoughts:[S.sd.w], box:(S.sd.box || []).slice() }); S.sheet = null; S.sd = {}; openText(n.id); break; }
    case 'linedone': { const a1 = $('#ans').value.trim(); if (!a1) break; const n = newText({ lines:[{ t:a1, strong:[] }] }); S.sheet = null; openText(n.id, 0); break; }
    case 'whydone': { const a1 = $('#ans').value.trim(); if (!a1) break; t.thoughts.push(S.sd.q + ' — ' + a1); save(t); closeSheet(); break; }
    case 'rmthought': t.thoughts.splice(+v, 1); save(t); render(); break;
    case 'rmbox': t.box.splice(+v, 1); save(t); render(); break;
    case 'line': { let i = +v;
      if (S.edit !== null) { const was = S.edit, n0 = t.lines.length; saveEdit(false); if (t.lines.length < n0 && was < i) i--; S.cur = Math.max(0, Math.min(i, t.lines.length - 1)); render(); return; }
      if (S.cur === i) S.edit = i; else S.cur = i; render(); break; }
    case 'addline': { if (S.edit !== null) saveEdit(false); const at = t.lines.length ? S.cur + 1 : 0; t.lines.splice(at, 0, { t:'', strong:[] }); S.cur = at; S.edit = at; save(t); render(); break; }
    case 'star': { const l = curLine(); if (!l || !l.t) break; l.star = !l.star; save(t); render(); toast(l.star ? 'В «Годное»' : 'Убрано из «Годного»'); break; }
    case 'copy': copyText($('#prompt').textContent).then(ok => toast(ok ? 'Запрос скопирован' : 'Не скопировалось — выдели текст вручную')); break;
    case 'pasteai': (async () => { try { const x = await navigator.clipboard.readText(); $('#aians').value = x; } catch { toast('Вставь вручную: долгое нажатие → «Вставить»'); } })(); break;
    case 'parse': { const list = parseAnswer($('#aians').value); if (!list.length) { toast('Не нашёл строк в ответе'); break; } S.sheet = 'deck'; S.sd = { list, i:0 }; renderSheet(); break; }
    case 'nextdeck': S.sd.i = (S.sd.i + 1) % S.sd.list.length; renderSheet(); break;
    case 'dropdeck': S.sd.list.splice(S.sd.i, 1); if (S.sd.i >= S.sd.list.length) S.sd.i = 0; renderSheet(); break;
    case 'takedeck': { const txt = S.sd.list.splice(S.sd.i, 1)[0]; if (S.sd.i >= S.sd.list.length) S.sd.i = 0;
      const L = curLine(); if (L && (goalOf(L) || !L.t)) { L.goal = undefined; L.t = txt; L.taps = null; L.ry = null; } else { const at = t.lines.length ? S.cur + 1 : 0; t.lines.splice(at, 0, { t:txt, strong:[] }); S.cur = at; }
      save(t); toast('Строка в тексте'); render(); break; }
    case 'strong': { S.sd.strong = S.sd.strong || []; const i = +v, k = S.sd.strong.indexOf(i); if (k >= 0) S.sd.strong.splice(k, 1); else S.sd.strong.push(i); drawTaps(); break; }
    case 'rreset': S.sd.taps = []; S.sd.strong = []; drawTaps(); break;
    case 'rdone': { const taps = S.sd.taps || []; if (taps.length) { const l = curLine(); l.taps = taps; l.strong = S.sd.strong || []; l.ry = taps.length; save(t); } closeSheet(); break; }
    case 'join': { const i = +v; S.sd.parts.splice(i - 1, 2, S.sd.parts[i - 1] + S.sd.parts[i]); S.sd.st = S.sd.st.filter(x => x !== i).map(x => x > i ? x - 1 : x); renderSheet(); break; }
    case 'sstr': { const i = +v, k = S.sd.st.indexOf(i); if (k >= 0) S.sd.st.splice(k, 1); else S.sd.st.push(i); renderSheet(); break; }
    case 'sreset': S.sd.parts = null; S.sd.st = null; renderSheet(); break;
    case 'sdone': { const l = curLine(), n = S.sd.parts.length; l.ry = n; l.strong = S.sd.st; l.taps = Array.from({ length:n }, (_, i) => [i * 300, 120]); save(t); closeSheet(); break; }
    case 'copytext': copyText(t.lines.filter(l => l.t).map(l => l.t).join('\n')).then(ok => toast(ok ? 'Текст скопирован' : 'Не скопировалось')); break;
    case 'delline': t.lines.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); save(t); closeSheet(); break;
    case 'deltext': S.sheet = 'confirmdel'; renderSheet(); break;
    case 'deltextyes': delText(t.id); S.sheet = null; S.view = 'home'; S.tab = S.back || 'write'; render(); toast('Текст удалён'); break;
    case 'rsi': S.sd.si = +v; if (isLat(S.sd.w)) setPron(S.sd.w, soundOf(S.sd.w).s, +v); renderSheet(); break;
    case 'psay': S.sd.psay = true; renderSheet(); { const i = $('#psay'); if (i) { i.focus(); i.select(); } } break;
    case 'psaydone': { const x = ($('#psay').value || '').toLowerCase().replace(/[^а-яё-]/g, ''); S.sd.psay = false;
      if (syl(x)) { const si = guessStress(x); setPron(S.sd.w, x, si); S.sd.si = si; toast('Запомнил: ' + S.sd.w + ' — ' + x); } else toast('Напиши русскими буквами, как слышишь');
      renderSheet(); break; }
    case 'rf': S.sd.f = v; renderSheet(); break;
    case 'sug': { const x = STRIP.items[+v]; if (x) insertWord(x.kind === 'z' ? x.w + ' ' : x.w, x.kind === 'r' || x.kind === 'rd'); break; }
    case 'matline': S.sheet = null; S.sd = {}; S.refocus = false; S.focusTA = S.mode === 'write'; { const c0 = S.caret; render(); S.caret = c0; } insertWord(v); toast('В строку: ' + v); break;
    case 'matbox': { if (!t.box.includes(v)) { t.box.push(v); save(t); } toast('В ящик: ' + v.slice(0, 40)); renderSheet(); break; }
    case 'popany': { const ci = cardByHead(v); showPop(ci !== null ? D.cards[ci].id : '', v); break; }
    case 'mtab': S.sd.tab = v; renderSheet(); break;
    case 'msem': S.sd.semLoad = true; renderSheet(); semTop(S.sd.q, 24).then(ix => { S.sd.sem = ix.filter(i => ![35, 36, 37, 38, 40].includes(D.cards[i].b)).slice(0, 12); S.sd.semLoad = false; renderSheet(); }).catch(() => { S.sd.semLoad = false; S.sd.sem = []; toast('Поиск по смыслу недоступен'); renderSheet(); }); break;
    case 'tags': if (document.activeElement === $('#ta')) { S.caret = $('#ta').selectionStart; S.refocus = true; document.activeElement.blur(); } S.sheet = 'tags'; S.sd = {}; renderSheet(); break;
    case 'tagon': setTarget(t, v); if ($('#mir')) drawMirror(); drawStrip(); break;
    case 'tagword': case 'tagown': { const w = a === 'tagown' ? lastWordOf($('#tagown').value || '') : v; if (!w) { toast('Впиши слово'); break; } setTarget(t, w); closeSheet(); break; }
    case 'copyclean': copyText(t.lines.filter(l => l.t).map(l => cleanText(l.t)).join('\n')).then(ok => toast(ok ? 'Скопировано без растяжек' : 'Не скопировалось')); break;
    case 'pmore': S.sd.seed = 1 + Math.floor(Math.random() * 99999); S.sd.list = null; renderSheet(); break;
    case 'pword': case 'pown': { const w = a === 'pown' ? lastWordOf($('#pown').value || '') : v; if (!w) { toast('Впиши слово'); break; } S.sd = { seed:S.sd.seed, list:S.sd.list, w, a:0 }; renderSheet(); { const sb = document.querySelector('.sheet .sb'); if (sb) sb.scrollTop = 0; } break; }
    case 'pback': S.sd = { seed:S.sd.seed, list:S.sd.list }; renderSheet(); break;
    case 'psense': { const i = +v, d = S.sd; if (d.a === i) { d.a = d.b ?? null; d.b = null; } else if (d.b === i) d.b = null; else if (d.a === null || d.a === undefined) d.a = i; else d.b = i; keepScroll(renderSheet); break; }
    case 'psenseadd': { const x = ($('#psense').value || '').trim(); if (x) { S.sd.turns.push({ t:x, src:'своё' }); if (S.sd.a !== undefined && S.sd.a !== null) S.sd.b = S.sd.turns.length - 1; else S.sd.a = S.sd.turns.length - 1; renderSheet(); } break; }
    case 'pnext': S.sd.step3 = true; S.sd.rh = S.sd.la = S.sd.lb = null; S.sd.pr = ''; renderSheet(); { const sb = document.querySelector('.sheet .sb'); if (sb) sb.scrollTop = 0; } break;
    case 'pform': { const x = ($('#pform').value || '').trim().toLowerCase(); if (x) { S.sd.form = x; S.sd.rh = null; S.sd.pr = ''; } keepScroll(renderSheet); break; }
    case 'pstep2': S.sd.form = ''; S.sd.step3 = false; renderSheet(); break;
    case 'pbox': { const b = S.sd.box, i = b.indexOf(v); if (i >= 0) b.splice(i, 1); else b.push(v); keepScroll(renderSheet); break; }
    case 'prhyme': S.sd.pr = S.sd.pr === v ? '' : v; keepScroll(renderSheet); break;
    case 'pdone': { const d = S.sd; { const x = ($('#pform') && $('#pform').value || '').trim().toLowerCase(); if (x) d.form = x; } const A = d.turns[d.a], B = d.turns[d.b], bl = baseLine(t); let at = bl ? t.lines.indexOf(bl) + 1 : t.lines.length; const reuse = t.lines[at] && !t.lines[at].t.trim() && (at === S.cur || at === t.lines.length - 1) ? 1 : 0;
      const l1 = d.pr ? { t:' ' + d.pr, goal:d.pr, strong:[] } : { t:'', strong:[] };
      t.lines.splice(at, reuse, l1, { t:' ' + d.form, goal:d.form, strong:[] }); t.thoughts.push('Панч «' + d.w + '»: подводка — ' + A.t + ', удар — ' + B.t); d.box.forEach(x => { if (!t.box.includes(x)) t.box.push(x); });
      S.cur = at; save(t); S.sheet = null; S.sd = {}; S.refocus = false;
      if (S.mode === 'write') { S.focusTA = true; S.caret = t.lines.slice(0, at).map(x => x.t).join('\n').length + (at ? 1 : 0); } render(); toast('Подводка и удар в тексте'); break; }
    case 'popunch': closePop(); if (S.view === 'text') { S.sheet = 'punch'; S.sd = { w:v, a:0, seed:1 }; renderSheet(); } else toast('Панч открывается из текста'); break;
    case 'lineact': S.cur = +v; gutCur(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); S.sheet = 'line1'; S.sd = { i:+v }; renderSheet(); break;
    case 'linego': S.cur = S.sd.i; S.sheet = v; S.sd = {}; renderSheet(); break;
    case 'linerhyme': { const w = lastWordOf(t.lines[S.sd.i].t); S.cur = S.sd.i; t.tagOn = ''; if (w) setTarget(t, w); closeSheet(); break; }
    case 'linestock': toast(addStock(t.lines[S.sd.i].t, 'строка из «' + titleOf(t).slice(0, 24) + '»') ? 'В запасе' : 'Уже в запасе'); closeSheet(); break;
    case 'fragat': S.sheet = 'frag'; S.sd = { k:pieceAt(t.lines, +v) }; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); renderSheet(); break;
    case 'fragcur': S.sheet = 'frag'; S.sd = { k:pieceAt(t.lines, Math.max(0, S.cur)) }; renderSheet(); break;
    case 'fragdo': { const F = splitFrags(t.lines), k0 = S.sd.k, P0 = F.pieces, G = F.gaps, txt = P0[k0].map(l => l.t).join('\n').trim(), undoLines = t.lines.slice();
      const back = msg => toastUndo(msg, () => { t.lines = undoLines; save(t); render(); });
      if (v === 'copy') { copyText(txt).then(ok => toast(ok ? 'Мысль скопирована' : 'Не скопировалось')); closeSheet(); break; }
      if (v === 'up' || v === 'down') { const j = k0 + (v === 'up' ? -1 : 1); [P0[k0], P0[j]] = [P0[j], P0[k0]]; setFrags(t, P0, G, j); back('Переставил'); break; }
      if (v === 'joinup' || v === 'joindown') { const j = v === 'joinup' ? k0 - 1 : k0; P0[j] = P0[j].concat(P0[j + 1]); P0.splice(j + 1, 1); G.splice(j, 1); setFrags(t, P0, G, j); back('Склеил'); break; }
      if (v === 'link') { const ln = fragLink(P0, k0); if (!ln) break; const me = P0[k0]; P0.splice(k0, 1); G.splice(Math.min(k0, G.length - 1), 1); const j = ln.j > k0 ? ln.j - 1 : ln.j; P0[j] = P0[j].concat(me); setFrags(t, P0, G, j); back('Поставил рядом'); break; }
      if (v === 'stock') { addStock(txt, 'мысль из «' + titleOf(t).slice(0, 24) + '»'); P0.splice(k0, 1); G.splice(Math.min(k0, Math.max(0, G.length - 1)), 1); setFrags(t, P0, G, Math.max(0, k0 - 1)); back('Мысль в запасе'); } break; }
    case 'homeword': { const x = ($('#home').value || '').trim(); if (!x) break; S.sheet = 'word'; S.sd = { w:x }; renderSheet(); break; }
    case 'homeline': { const x = ($('#home').value || '').trim(); if (!x) break; S.homeV = ''; const n = newText({ lines:[{ t:x, strong:[] }] }); openText(n.id, 0); break; }
    case 'homestock': { const x = ($('#home').value || '').trim(); if (!x) break; addStock(x, 'с главной'); S.homeV = ''; render(); toast('В запасе'); break; }
    case 'allstock': S.tab = 'notes'; S.seg = 'stock'; S.view = 'home'; render(); break;
    case 'stockopen': S.sheet = 'stock1'; S.sd = { t:v }; renderSheet(); break;
    case 'stockto': { const x = S.sd.t; if (v === 'del') { STOCK = STOCK.filter(y => y.t !== x); saveStock(); S.sheet = null; render(); toast('Убрал из запаса'); break; } if (v === 'copy') { copyText(x).then(ok => toast(ok ? 'Скопировано' : 'Не скопировалось')); break; }
      if (v === 'new') { const n = newText({ lines:x.split('\n').map(q => ({ t:q, strong:[] })) }); S.sheet = null; S.sd = {}; openText(n.id); break; }
      const lt = texts.get(S.lastText) || [...texts.values()].filter(y => !y.archived).sort((p, q) => q.updated - p.updated)[0]; if (!lt) break; S.sheet = null; S.sd = {};
      if (x.includes('\n') || toks(x).length > 4) { while (lt.lines.length && !lt.lines[lt.lines.length - 1].t.trim()) lt.lines.pop(); if (lt.lines.length) for (let q = 0; q < 3; q++) lt.lines.push({ t:'', strong:[] }); x.split('\n').forEach(q => lt.lines.push({ t:q, strong:[] })); save(lt); openText(lt.id); toast('Добавил отдельной мыслью'); }
      else { if (!lt.box.includes(x)) lt.box.push(x); save(lt); openText(lt.id); toast('В ящике этого текста'); } break; }
    case 'stockadd': toast(addStock(v, 'из словаря') ? 'В запасе: ' + v.slice(0, 30) : 'Уже в запасе'); break;
    case 'boxins': { const x = t.box[+v]; if (x) insertWord(x.replace(/\s*\([^)]*\)$/, '')); break; }
    case 'boxstock': t.box.forEach(x => addStock(x, 'ящик «' + titleOf(t).slice(0, 24) + '»')); t.box = []; save(t); render(); toast('Ящик в запасе'); break;
    case 'endmore': S.sd.seed = 1 + Math.floor(Math.random() * 9999); S.sd.data = null; renderSheet(); break;
    case 'chain': { const last = /\s/.test(v) ? mainWord(v) : v; if (S.sheet !== 'chain') { S.sd = { path:[last], prev:{ sheet:S.sheet, sd:S.sd } }; S.sheet = 'chain'; } else S.sd.path.push(last); renderSheet(); const sb = document.querySelector('.sheet .sb'); if (sb) sb.scrollTop = 0; break; }
    case 'chainback': if (S.sd.path.length > 1) S.sd.path.pop(); else { const p = S.sd.prev; S.sheet = p.sheet; S.sd = p.sd; } renderSheet(); break;
    case 'rtab': S.sd.rtab = v; renderSheet(); break;
    case 'popclose': closePop(); break;
    case 'popword': showPop('', v); break;
    case 'phrbox': if (t) { if (!t.box.includes(v)) { t.box.push(v); save(t); } toast('В ящик: ' + v); } else toast('Сначала открой текст'); break;
    case 'popcard': showPop(v, ''); break;
    case 'popchain': closePop(); if (S.view === 'text') act('chain', v); else toast('Цепочка открывается из текста'); break;
    case 'popfav': D.fav.has(v) ? D.fav.delete(v) : D.fav.add(v); kvSet('fav', [...D.fav]); showPop(S.pop.id, S.pop.word); break;
    case 'popline': closePop(); if (S.sheet) { S.sheet = null; S.sd = {}; S.focusTA = S.mode === 'write'; const c0 = S.caret; S.refocus = false; render(); S.caret = c0; } insertWord(v); break;
    case 'rpick': { // рифма → конец следующей строки «… слово»
      const bl = baseLine(t), bi = bl ? t.lines.indexOf(bl) : S.cur, reuse = t.lines[bi + 1] && !t.lines[bi + 1].t.trim() && bi + 1 === S.cur; const at = bi + 1; t.lines.splice(at, reuse ? 1 : 0, { t:' ' + v, goal:v, strong:[] }); S.cur = at; save(t);
      S.sheet = null; S.sd = {};
      if (S.mode === 'write') { S.focusTA = true; S.caret = t.lines.slice(0, at).map(l => l.t).join(String.fromCharCode(10)).length + 1; }
      render(); toast('Следующая строка закончится на «' + v + '»'); break; }
    case 'arch': { const x = texts.get(v); x.archived = true; putNow(x); render(); toastUndo('В архиве', () => { x.archived = false; putNow(x); render(); }); break; }
    case 'unarch': { const x = texts.get(v); x.archived = false; putNow(x); render(); toast('Вернул в тексты'); break; }
    case 'sdel': { const x = texts.get(v); delText(v); render(); toastUndo('Текст удалён', () => { texts.set(x.id, x); putNow(x); render(); }); break; }
    case 'undo': { const f = undoFn; undoFn = null; $('#toast').classList.remove('on', 'undo'); if (f) f(); break; }
    case 'export': exportAll(); break;
    case 'import': importAll(); break;
  }
}
document.addEventListener('click', e => { const el = e.target.closest('[data-act]');
  if (!e.target.closest('.swrow')) closeRows();
  if (!el) return; if (el.tagName === 'A' || el.dataset.drag) return;
  if (el.classList.contains('swi') && el.parentElement.classList.contains('open')) { closeRows(); return; }
  act(el.dataset.act, el.dataset.v, el); });

// ---------- копия ----------
async function exportAll(){
  flushAll(); const data = { kind:'strokes-backup', version:1, saved:new Date().toISOString(), texts:[...texts.values()], stock:STOCK, fav:[...D.fav], pron:R.pron };
  const name = 'stroki-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([JSON.stringify(data)], name, { type:'application/json' });
  if (navigator.canShare && navigator.canShare({ files:[file] })) { try { await navigator.share({ files:[file], title:name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('Копия сохранена: ' + name);
}
function importAll(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); if (d.kind !== 'strokes-backup') throw new Error('это не копия «Строк»');
      let n = 0; d.texts.forEach(t => { const have = texts.get(t.id); if (!have || (t.updated || 0) > (have.updated || 0)) { texts.set(t.id, t); putNow(t); n++; } });
      (d.stock || []).slice().reverse().forEach(x => { if (x && x.t && !STOCK.some(y => y.t === x.t)) STOCK.unshift(x); }); saveStock(); if (d.fav) { d.fav.forEach(x => D.fav.add(x)); kvSet('fav', [...D.fav]); } if (d.pron) { R.pron = { ...d.pron, ...R.pron }; kvSet('pron', R.pron); }
      toast('Загружено текстов: ' + n); render(); } catch (e) { toast('Не получилось: ' + e.message); } };
  inp.click();
}

// ---------- словарь (0.2) ----------
const D = { ready:false, loading:null, cards:[], byId:new Map(), blocks:[], vec:null, dim:384, scale:400, personal:false, fav:new Set(), q:'', res:null, semStatus:'', blk:null, open:null };
const norm = s => String(s).toLowerCase().replace(/́/g, '').replace(/ё/g, 'е').replace(/\*\*/g, '');
const kvGet = k => new Promise(res => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
const kvSet = (k, v) => db.transaction('kv', 'readwrite').objectStore('kv').put(v, k);
function b64ToI8(b){ const s = atob(b), a = new Int8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = (s.charCodeAt(i) << 24) >> 24; return a; }
function loadDict(){
  if (D.loading) return D.loading;
  D.loading = (async () => {
    const [j, vb] = await Promise.all([fetch('data/dict.json').then(r => r.json()), fetch('data/vec.bin').then(r => r.arrayBuffer())]);
    D.blocks = j.blocks; D.dim = j.dim; D.scale = j.scale; D.cards = j.cards.map(c => ({ ...c, mine:[] }));
    let vec = new Int8Array(vb);
    const p = await kvGet('personal');
    if (p && p.kind === 'personal-dictionary') {
      D.personal = true;
      D.cards.forEach(c => { if (p.cards[c.id]) c.mine = p.cards[c.id]; });
      const extra = p.extra.map(c => ({ ...c, f:[], mine:c.f, own:true }));
      if (p.extraVec) { const ev = b64ToI8(p.extraVec), all = new Int8Array(vec.length + ev.length); all.set(vec); all.set(ev, vec.length); vec = all; }
      else extra.forEach(() => { const all = new Int8Array(vec.length + D.dim); all.set(vec); vec = all; });
      D.cards = D.cards.concat(extra);
    }
    D.vec = vec; D.byId = new Map(D.cards.map((c, i) => [c.id, i]));
    D.cards.forEach(c => c.hay = norm(c.word + ' ' + c.say + ' ' + c.f.concat(c.mine).map(x => x[1]).join(' ')));
    D.fav = new Set((await kvGet('fav')) || []); D.zseen = (await kvGet('zseen')) || {}; buildIndex(D.cards); HT = null;
    D.ready = true;
  })();
  return D.loading;
}
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const blockTitle = n => (D.blocks.find(b => b.n === n) || {}).title || '';
function cardHTML(c){
  const op = D.open === c.id, fav = D.fav.has(c.id);
  const short = (c.f[0] || c.mine[0] || ['', ''])[1];
  let h = '<div class="item dcard" data-act="dopen" data-v="' + c.id + '"><div class="h">' + (fav ? '★ ' : '') + esc(c.word) + (c.say ? ' <span class="muted" style="font-weight:400">' + esc(c.say) + '</span>' : '') + (c.own ? ' <span class="muted" style="font-weight:400">· твоё</span>' : '') + '</div>';
  if (!op) h += '<div class="m">' + fmt(short).slice(0, 220) + '</div>';
  else { c.f.forEach(([l, t]) => h += '<div class="fld">' + (l ? '<i>' + esc(l) + '</i>' : '') + fmt(t) + '</div>');
    c.mine.forEach(([l, t]) => h += '<div class="fld mine"><i>' + esc(l || '') + ' · личное</i>' + fmt(t) + '</div>');
    h += '<div class="row" style="margin-top:8px"><button class="btn" data-act="dfav" data-v="' + c.id + '">' + (fav ? '★ в избранном' : '☆ в избранное') + '</button><button class="btn" data-act="dbox" data-v="' + c.id + '">в ящик текста</button><button class="btn" data-act="stockadd" data-v="' + esc(insertForm(c)) + '">в запас</button></div>'; }
  return h + '</div>';
}
function renderDict(){
  if (!D.ready) { hdr('', 'Словарь', ''); $('#main').innerHTML = '<div class="empty">загружаю словарь…</div>'; $('#tools').innerHTML = ''; loadDict().then(render).catch(e => { $('#main').innerHTML = '<div class="soon">Словарь не загрузился: ' + esc(e.message) + '<br>Нужен интернет при первом открытии.</div>'; }); return; }
  $('#tools').innerHTML = '';
  if (D.blk) { const cs = D.cards.filter(c => c.b === D.blk);
    hdr('<button class="a" data-act="dback">‹ Блоки</button>', esc(D.blk + '. ' + blockTitle(D.blk)), '<span class="a r"></span>');
    let h = '', g = null; if (!cs.length) h = '<div class="soon">Блок пока пустой.</div>';
    cs.forEach(c => { if (c.g !== g) { g = c.g; if (g) h += '<div class="grp">' + esc(g) + '</div>'; } h += cardHTML(c); });
    $('#main').innerHTML = h; return; }
  hdr('', 'Словарь', '<button class="a r" data-act="drand">🎲</button>');
  let h = '<input class="f" id="dq" placeholder="поиск: слово или смысл («холодно и одиноко»)" value="' + esc(D.q) + '" enterkeyhint="search">';
  if (D.q.trim()) {
    const r = D.res || { words:[], sem:[] };
    const one = q => /^([а-яё-]{2,}|[a-z'’-]{2,})$/i.test(q.trim());
    if (one(D.q) && R.ready) { const w = lastWordOf(D.q), so = soundOf(w), r2 = findRhymes(so.s, so.si, isLat(w)), e2 = findEng(so.s, so.si, w);
      const all = r2.exact.slice(0, 16).concat(r2.near.slice(0, 12), e2.exact.concat(e2.near).slice(0, 8).map(x => x.w));
      h += '<div class="grp">Рифмы к «' + esc(w) + '» · тап — в ящик текста</div><div class="chips">' + (all.length ? all.map(x => '<button class="chip rh" data-act="rbox" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('') : '<span class="muted">нет</span>') + '</div>'; }
    else if (one(D.q) && !R.ready) loadRhymes().then(render);
    h += '<div class="grp">Совпадения по словам · ' + r.words.length + '</div>' + (r.words.length ? r.words.slice(0, 30).map(i => cardHTML(D.cards[i])).join('') : '<div class="muted" style="margin:0 2px">нет</div>');
    h += '<div class="grp">Близко по смыслу</div>' + (D.semStatus ? '<div class="muted" style="margin:0 2px">' + esc(D.semStatus) + '</div>' : '') + r.sem.map(i => cardHTML(D.cards[i])).join('');
  } else {
    const favs = D.cards.filter(c => D.fav.has(c.id));
    if (favs.length) h += '<div class="grp">★ Избранное · ' + favs.length + '</div>' + favs.slice(0, 50).map(cardHTML).join('');
    h += '<div class="grp">Блоки · ' + D.cards.length + ' карточек</div>';
    const cnt = {}; D.cards.forEach(c => cnt[c.b] = (cnt[c.b] || 0) + 1);
    h += D.blocks.map(b => '<button class="item" data-act="dblk" data-v="' + b.n + '" style="display:flex;gap:8px"><span class="muted" style="width:22px">' + b.n + '</span><span style="flex:1" class="h">' + esc(b.title) + '</span><span class="muted">' + (cnt[b.n] || (b.personal ? 'в личном файле' : 'скоро')) + '</span></button>').join('');
    h += '<div class="grp">Личный словарь</div><div class="muted" style="margin:0 2px 8px">' + (D.personal ? 'Загружен: твои крючки и блоки «Чувства», «Вопросы», «Заходы» на месте. Хранится только в этом телефоне.' : 'Не загружен. Твои крючки и блоки «Чувства», «Вопросы», «Заходы» лежат в отдельном файле, который не публикуется. Загрузи его один раз.') + '</div>' +
      '<button class="btn" data-act="dpersonal">' + (D.personal ? 'Обновить личный файл' : 'Загрузить личный файл') + '</button>';
  }
  $('#main').innerHTML = h;
  const q = $('#dq'); if (q) { q.addEventListener('input', e => { D.q = e.target.value; clearTimeout(D.t); D.t = setTimeout(() => runSearch(true), 350); });
    if (document.activeElement !== q && D.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
async function runSearch(keepFocus){
  const q = D.q.trim(); D.focusQ = keepFocus; if (!q) { D.res = null; render(); return; }
  const nq = norm(q), words = []; D.cards.forEach((c, i) => { if (c.hay.includes(nq)) words.push(i); });
  words.sort((a, b) => (norm(D.cards[b].word).includes(nq) ? 1 : 0) - (norm(D.cards[a].word).includes(nq) ? 1 : 0));
  D.res = { words, sem: D.res && D.res.q === q ? D.res.sem : [] , q };
  if (q.length >= 3) {
    if (!ext) D.semStatus = 'загружаю смысловую модель (один раз, около 120 МБ)…';
    render();
    try {
      await getExt();
      const v = (await ext('query: ' + q, { pooling:'mean', normalize:true })).data;
      if (D.q.trim() !== q) return;
      const N = D.cards.length, dim = D.dim, sc = [], ws = new Set(words.slice(0, 30));
      for (let i = 0; i < N; i++) { if (ws.has(i)) continue; let s = 0; const o = i * dim; for (let k = 0; k < dim; k++) s += D.vec[o + k] * v[k]; sc.push([s, i]); }
      sc.sort((a, b) => b[0] - a[0]); D.res.sem = sc.slice(0, 12).map(x => x[1]); D.semStatus = '';
    } catch (e) { D.semStatus = 'поиск по смыслу недоступен: ' + e.message; }
  }
  render();
}
async function importPersonal(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => { try { const p = JSON.parse(await inp.files[0].text()); if (p.kind !== 'personal-dictionary') throw new Error('это не личный словарь');
      kvSet('personal', p); D.ready = false; D.loading = null; await loadDict(); toast('Личный словарь загружен'); render(); } catch (e) { toast('Не получилось: ' + e.message); } };
  inp.click();
}
function dictAct(a, v){
  switch (a) {
    case 'dblk': D.blk = +v; D.open = null; render(); $('#main').scrollTop = 0; return true;
    case 'dback': D.blk = null; D.open = null; render(); return true;
    case 'dopen': D.open = D.open === v ? null : v; D.focusQ = false; render(); return true;
    case 'dfav': { D.fav.has(v) ? D.fav.delete(v) : D.fav.add(v); kvSet('fav', [...D.fav]); render(); return true; }
    case 'dbox': { const c = D.cards[D.byId.get(v)], t = texts.get(S.lastText); if (!t) { toast('Сначала открой текст — ящик у каждого текста свой'); return true; }
      const short = (c.f[0] || c.mine[0] || ['', ''])[1].replace(/\*\*/g, '').split(/[.;]/)[0].slice(0, 60);
      const item = c.word + (short ? ' (' + short + ')' : ''); if (!t.box.includes(item)) { t.box.push(item); save(t); } toast('В ящик «' + titleOf(t).slice(0, 24) + '»'); return true; }
    case 'drand': { const c = D.cards[Math.floor(Math.random() * D.cards.length)]; D.blk = c.b; D.open = c.id; render();
      setTimeout(() => { const el = document.querySelector('[data-v="' + c.id + '"]'); if (el) el.scrollIntoView({ block:'center' }); }, 30); return true; }
    case 'dpersonal': importPersonal(); return true;
    case 'rbox': { const t = texts.get(S.lastText); if (!t) { toast('Сначала открой текст — ящик у каждого текста свой'); return true; }
      if (!t.box.includes(v)) { t.box.push(v); save(t); } toast('«' + v + '» в ящик «' + titleOf(t).slice(0, 20) + '»'); return true; }
  }
  return false;
}

// ---------- 0.4: слово, фраза и тема дня; заходы ----------
const shortOf = c => ((c.f[0] || c.mine[0] || ['', ''])[1] || '').replace(/\*\*/g, '');
function rng(seed){ let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let x = h; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const pickR = (a, r) => a[Math.floor(r() * a.length)];
const dayKey = off => { const d = new Date(); d.setDate(d.getDate() - off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const OBJECTS = ['Ключи от машины','Мяч после тренировки','Наушники','Зажигалка','Чек из магазина','Кроссовки у двери','Телефон на 3%','Старая фотография','Куртка на стуле','Билет на поезд','Шрам','Часы на руке','Подъезд','Окно ночью','Кольцо','Сломанный зонт','Номерок из гардероба','Пустая бутылка','Пульт от телевизора','Рюкзак в багажнике'];
const SCENES = ['Пробка утром, все сигналят','Заправка в три ночи','Пустая квартира вечером','Раздевалка за пять минут до игры','Такси после тусовки','Кухня, где все уже спят','Лифт с незнакомцем','Очередь в аэропорту','Первый снег во дворе','Остановка, автобус не приходит','Последняя электричка','Двор, где вырос'];
const LIMITS = ['Куплет без слова «я»','Четыре строки на одну рифму','Только короткие слова, до двух слогов','Каждая строка с одного и того же слова','Ни одного прилагательного','Всё через спортивные термины','Строка — вопрос, строка — ответ','Ни одного бренда'];
function makeTheme(r){
  const types = ['obj','scene','limit','q','fact','body'], t = pickR(types, r);
  if (t === 'obj') return { type:'Предмет крупным планом', text:pickR(OBJECTS, r), hint:'что видишь, слышишь, чем пахнет — без чувств напрямую' };
  if (t === 'scene') return { type:'Сцена', text:pickR(SCENES, r), hint:'где ты, кто рядом, что сейчас случится' };
  if (t === 'limit') return { type:'Ограничение', text:pickR(LIMITS, r), hint:'правило игры на 10 минут' };
  if (t === 'q') return { type:'Вопрос', text:pickR(QUESTIONS, r), hint:'ответ — и есть первая строка' };
  const pool = D.cards.filter(c => !c.own && (t === 'fact' ? [21, 25, 27].includes(c.b) : c.b === 29) && c.f.length);
  if (!pool.length) return { type:'Предмет крупным планом', text:pickR(OBJECTS, r), hint:'' };
  const c = pickR(pool, r);
  if (t === 'fact') { const known = (c.f[1] || c.f[0])[1].replace(/\*\*/g, '').split(/(?<=\.)\s/)[0]; return { type:'Факт, перевёрнутый на себя', text:c.word + ': ' + known, hint:'а как это у тебя?' }; }
  return { type:'Чувство через тело', text:c.word + ' — ' + shortOf(c), hint:'покажи через предмет, не называя чувство' };
}
function dayContent(off, n = 0){
  const r = rng(dayKey(off) + '#' + n);
  const pool = D.cards.filter(c => !c.own && c.f.length && ![34, 35, 36, 37, 38, 40].includes(c.b));
  const phrases = D.cards.filter(c => c.b === 26 && /выражени|сленг/i.test(c.g || ''));
  return { key:dayKey(off), word:pickR(pool, r), phrase:pickR(phrases.length ? phrases : pool, r), theme:makeTheme(r) };
}
let ext = null, extLoading = null;
function getExt(){ if (ext) return Promise.resolve(ext); if (extLoading) return extLoading;
  extLoading = (async () => { const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2'); env.allowLocalModels = false;
    ext = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype:'q8', device:'wasm' }); return ext; })(); return extLoading; }
async function semTop(q, k, filter){
  await loadDict(); const e = await getExt(); const v = (await e('query: ' + q, { pooling:'mean', normalize:true })).data;
  const N = D.cards.length, dim = D.dim, sc = [];
  for (let i = 0; i < N; i++) { if (filter && !filter(D.cards[i])) continue; let s = 0; const o = i * dim; for (let j = 0; j < dim; j++) s += D.vec[o + j] * v[j]; sc.push([s, i]); }
  return sc.sort((a, b) => b[0] - a[0]).slice(0, k).map(x => x[1]);
}
function zahodOrder(t){
  const used = new Set(t.lines.map(l => norm(l.t)));
  const zs = D.zseen || {}, all = D.cards.map((c, i) => [c, i]).filter(([c]) => c.b === 40 && (!S.sd.zg || c.g === S.sd.zg) && ![...used].some(u => u.startsWith(norm(c.word)))).map(x => x[1]);
  // сначала те, что ещё не пропускал; пропущенные возвращаются, начиная с самых давних
  const rnd = all.filter(i => !zs[D.cards[i].word]).sort(() => Math.random() - .5).concat(all.filter(i => zs[D.cards[i].word]).sort((a, b) => zs[D.cards[a].word] - zs[D.cards[b].word]));
  // по смыслу — если модель уже в памяти; иначе случайно, а модель грузим в фоне на следующий раз
  const L = curLine(), ctx = (L && L.t && !goalOf(L) ? L.t : (t.lines.slice(0, S.cur).filter(l => l.t).slice(-1)[0] || {}).t) || '';
  if (ctx && ext && !S.sd.zg) { S.sd.ranked = true;
    semTop(ctx, 10, c => c.b === 40).then(top => { if (S.sheet !== 'zahod' || S.sd.i > 0) return; const rest = rnd.filter(i => !top.includes(i));
      const mix = []; top.forEach((x, k) => { mix.push(x); if (rest[k] !== undefined) mix.push(rest[k]); }); S.sd.order = mix.concat(rest.slice(top.length)); renderSheet(); }); }
  else if (!ext) getExt().catch(() => {});
  return rnd;
}

function renderFeed(){
  hdr('', 'Лента дня', '<button class="a r" data-act="feedmore">🎲</button>'); $('#tools').innerHTML = '';
  if (!D.ready) { $('#main').innerHTML = '<div class="empty">загружаю словарь…</div>'; loadDict().then(render); return; }
  const c = dayContent(0, S.feedN || 0);
  const card = (k, title, body, btns) => '<div class="feed"><div class="k">' + k + '</div><div class="v">' + title + '</div>' + body + '<div class="row" style="margin-top:10px">' + btns + '</div></div>';
  let h = card('Слово дня', esc(c.word.word) + (c.word.say ? ' <span class="muted">' + esc(c.word.say) + '</span>' : ''), '<div class="d">' + fmt(shortOf(c.word)) + '</div>',
      '<button class="btn main" data-act="feedword">Писать с этого</button><button class="btn" data-act="feedrhyme" data-v="' + esc(c.word.word) + '">Рифмы</button><button class="btn" data-act="feedcard" data-v="' + c.word.id + '">Карточка</button>');
  h += card('Фраза дня', esc(c.phrase.word), '<div class="d">' + fmt(shortOf(c.phrase)) + '</div>', '<button class="btn main" data-act="feedphrase">Писать с этого</button><button class="btn" data-act="feedcard" data-v="' + c.phrase.id + '">Карточка</button>');
  h += card('Тема дня · ' + esc(c.theme.type), esc(c.theme.text), c.theme.hint ? '<div class="d">' + esc(c.theme.hint) + '</div>' : '', '<button class="btn main" data-act="feedtheme">Начать · 10 минут</button>');
  if (S.feedN) h += '<div class="muted" style="text-align:center;margin:6px 0">другой вариант на сегодня · <button class="btn ghost" data-act="feedreset">вернуть дневной</button></div>';
  h += '<div class="grp">Прошлые дни</div>';
  for (let off = 1; off <= 6; off++) { const p = dayContent(off); const dd = new Date(p.key).toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
    h += '<button class="item" data-act="feedpast" data-v="' + off + '"><div class="h">' + dd + ' · ' + esc(p.word.word) + ' · ' + esc(p.phrase.word) + '</div><div class="m">' + esc(p.theme.type) + ': ' + esc(p.theme.text) + '</div></button>'; }
  $('#main').innerHTML = h;
}
// таймер темы дня
let timerIv = null;
function startTimer(id){ S.timerEnd = Date.now() + 10 * 60000; S.timerId = id; clearInterval(timerIv);
  timerIv = setInterval(() => { const el = $('#timer'); const left = S.timerEnd - Date.now();
    if (left <= 0) { clearInterval(timerIv); S.timerEnd = null; if (el) el.remove(); toast('10 минут прошли'); if (navigator.vibrate) navigator.vibrate(300); return; }
    if (el) el.textContent = '⏱ ' + Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0'); }, 1000); }

// ---------- 1.0: внешний вид ----------
// Обои — только в этом телефоне (IndexedDB), в репозиторий и интернет не уходят.
const LOOK = { dim:.45, text:'B', daily:true, active:null, wps:[] };   // wps: [{id, blob}]
let wpURLs = new Map();
async function loadLook(){ const l = await kvGet('look'); if (l) Object.assign(LOOK, l); LOOK.wps = (await kvGet('wps')) || []; applyLook(); }
function saveLook(){ const { wps, ...rest } = LOOK; kvSet('look', rest); }
function wpURL(w){ if (!wpURLs.has(w.id)) wpURLs.set(w.id, URL.createObjectURL(w.blob)); return wpURLs.get(w.id); }
function currentWp(){ if (!LOOK.wps.length) return null;
  if (LOOK.daily) { const r = rng(dayKey(0) + 'wp'); return LOOK.wps[Math.floor(r() * LOOK.wps.length)]; }
  return LOOK.wps.find(w => w.id === LOOK.active) || LOOK.wps[0]; }
function applyLook(){
  document.documentElement.style.setProperty('--dim', LOOK.dim);
  const img = document.querySelector('#wp .img'), w = currentWp();
  if (w) { img.classList.remove('def'); img.style.backgroundImage = 'url("' + wpURL(w) + '")'; } else { img.classList.add('def'); img.style.backgroundImage = ''; }
}
async function shrink(file){ // уменьшаем фото до 1600 px, чтобы не забивать память
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return await new Promise(res => c.toBlob(res, 'image/jpeg', .85)); }
function addWallpapers(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = async () => { let n = 0; for (const f of inp.files) { try { const blob = await shrink(f); const w = { id:uid(), blob }; LOOK.wps.push(w); LOOK.active = w.id; n++; } catch (e) { toast('Не получилось: ' + e.message); } }
    if (n) { await kvSet('wps', LOOK.wps); saveLook(); applyLook(); render(); toast('Обоев добавлено: ' + n); } };
  inp.click();
}
function renderLook(){
  hdr('<button class="a" data-act="lookback">‹ Блокнот</button>', 'Внешний вид', '<span class="a r"></span>'); $('#tools').innerHTML = '';
  const cur = currentWp();
  let h = '<div class="set"><div class="h">Обои</div><div class="m">из «Фото» на телефоне, можно несколько. Хранятся только здесь.</div><div class="thumbs">' +
    '<button class="th' + (!LOOK.wps.length ? ' on' : '') + '" style="background:radial-gradient(40px 30px at 70% 20%,rgba(255,170,90,.7),transparent),radial-gradient(50px 40px at 25% 40%,rgba(120,90,255,.6),transparent),linear-gradient(180deg,#151530,#000)" data-act="wpdef" title="Ночные огни"></button>' +
    LOOK.wps.map(w => '<button class="th' + (cur && cur.id === w.id ? ' on' : '') + '" style="background-image:url(\'' + wpURL(w) + '\')" data-act="wpsel" data-v="' + w.id + '"><span class="del" data-act="wpdel" data-v="' + w.id + '">✕</span></button>').join('') +
    '<button class="th add" data-act="wpadd">＋</button></div><div class="m" style="margin-top:8px">Первая — «ночные огни», стоят, пока нет своих.</div></div>';
  h += '<div class="set"><div class="h">Менять каждый день<button class="toggle' + (LOOK.daily ? ' on' : '') + '" data-act="wpdaily"></button></div><div class="m">каждый день — другие обои из твоих</div></div>';
  h += '<div class="set"><div class="h">Затемнение фона <span class="muted" id="dimv">' + Math.round(LOOK.dim * 100) + '%</span></div><div class="m">чтобы карточки на стекле читались</div><input type="range" id="dim" min="0.1" max="0.85" step="0.05" value="' + LOOK.dim + '"></div>';
  h += '<div class="set"><div class="h">Экран текста</div><div class="m">сколько фона там, где пишешь</div><div class="seg" style="margin-top:10px">' +
    [['A','А · чёрный'],['B','Б · в шапке'],['C','В · под текстом']].map(([k, n]) => '<button data-act="tmode" data-v="' + k + '" class="' + (LOOK.text === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div></div>';
  $('#main').innerHTML = h;
  $('#dim').addEventListener('input', e => { LOOK.dim = +e.target.value; $('#dimv').textContent = Math.round(LOOK.dim * 100) + '%'; applyLook(); saveLook(); });
}
function lookAct(a, v){
  switch (a) {
    case 'look': S.view = 'look'; render(); return true;
    case 'lookback': S.view = 'home'; S.tab = 'notes'; render(); return true;
    case 'wpadd': addWallpapers(); return true;
    case 'wpdef': LOOK.wps = LOOK.wps; LOOK.active = null; LOOK.daily = false; if (LOOK.wps.length) toast('Чтобы стояли «ночные огни», удали свои обои ✕'); saveLook(); applyLook(); render(); return true;
    case 'wpsel': LOOK.active = v; LOOK.daily = false; saveLook(); applyLook(); render(); return true;
    case 'wpdel': LOOK.wps = LOOK.wps.filter(w => w.id !== v); if (LOOK.active === v) LOOK.active = null; kvSet('wps', LOOK.wps); saveLook(); applyLook(); render(); return true;
    case 'wpdaily': LOOK.daily = !LOOK.daily; saveLook(); applyLook(); render(); return true;
    case 'tmode': LOOK.text = v; saveLook(); render(); toast('Экран текста: ' + { A:'чёрный', B:'фон в шапке', C:'фон под текстом' }[v]); return true;
  }
  return false;
}

// ---------- рифмы (0.3) ----------
// Ударения: словарь Козиева (CC0). Частотность: FrequencyWords (CC BY-SA 4.0).
const R = { ready:false, loading:null, words:[], si:[], byWord:new Map(), key:new Map(), skel:new Map(), dict:[], eng:[], engBy:new Map(), engKey:new Map(), engSkel:new Map(), pron:{} };
const ENG_TOP = 9000; // как рифмы предлагаем только частые английские слова, произношение знаем у всех
const VS = 'аеёиоуыэюя';
const STRESSED = { а:'а', я:'а', о:'о', ё:'о', у:'у', ю:'у', э:'э', е:'э', и:'и', ы:'ы' };
const REDUCED = { а:'а', я:'а', о:'а', ё:'о', е:'и', и:'и', э:'и', у:'у', ю:'у', ы:'ы' };
const DEVOICE = { б:'п', в:'ф', г:'к', д:'т', ж:'ш', з:'с' };
function tail(word, si){
  const t = word.slice(si); let out = '';
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === 'ь' || c === 'ъ' || c === '-') continue;
    out += i === 0 ? (STRESSED[c] || c) : VS.includes(c) ? REDUCED[c] : c; }
  // оглушение согласных на конце: «дуб» = «дуп»
  const a = [...out]; for (let k = a.length - 1; k > 0 && !'аоуэиы'.includes(a[k]); k--) if (DEVOICE[a[k]]) a[k] = DEVOICE[a[k]];
  return a.join('');
}
const skelOf = tl => [...tl].filter(c => 'аоуэиы'.includes(c)).map(c => c === 'ы' ? 'и' : c).join('');
function loadRhymes(){
  if (R.loading) return R.loading;
  R.loading = (async () => {
    const [txt, ds, , en, pron] = await Promise.all([fetch('data/rhymes.txt').then(r => r.text()), fetch('data/dict-stress.json').then(r => r.json()), loadDict(), fetch('data/english.txt').then(r => r.ok ? r.text() : '').catch(() => ''), kvGet('pron')]);
    R.pron = pron || {}; const snd = new Set();
    en.split(/\r?\n/).forEach((line, i) => { const [w, p] = line.split('\t'); if (!p) return; const si = p.indexOf('^'), s = p.replace('^', ''); R.engBy.set(w, { s, si });
      if (i >= ENG_TOP || w.length < 2 || snd.has(p)) return; snd.add(p); const tl = tail(s, si), sk = skelOf(tl), k = R.eng.push({ w, s, si, tl, sk }) - 1;
      (R.engKey.get(tl) || R.engKey.set(tl, []).get(tl)).push(k); (R.engSkel.get(sk) || R.engSkel.set(sk, []).get(sk)).push(k); });
    txt.split(/\r?\n/).forEach((line, i) => { line = line.trim(); const si = line.indexOf('^'); if (si < 0) return; const w = line.slice(0, si) + line.slice(si + 1);
      R.words.push(w); R.si.push(si); R.byWord.set(w, si); if (!R.byWord.has(w.replace(/ё/g, 'е'))) R.byWord.set(w.replace(/ё/g, 'е'), si);
      const tl = tail(w, si), sk = skelOf(tl);
      (R.key.get(tl) || R.key.set(tl, []).get(tl)).push(i); (R.skel.get(sk) || R.skel.set(sk, []).get(sk)).push(i); });
    Object.entries(ds).forEach(([id, st]) => { const ci = D.byId.get(id); if (ci === undefined) return; const si = st.indexOf('^'); if (si < 0) return;
      const w = st.replace('^', ''); const tl = tail(w, si); R.dict.push({ ci, w, tl, sk:skelOf(tl) }); });
    R.ready = true; scheduleStrip(); if ($('#mir')) drawMirror();
  })();
  return R.loading;
}
function guessStress(w){
  if (HINTS.has(w)) return HINTS.get(w);
  if (R.byWord.has(w)) return R.byWord.get(w);
  const we = w.replace(/ё/g, 'е'); if (R.byWord.has(we)) return R.byWord.get(we);
  const ps = punchStress(w); if (ps !== undefined) return ps;
  const e = w.indexOf('ё'); if (e >= 0) return e;
  const vs = [...w].map((c, i) => VS.includes(c) ? i : -1).filter(i => i >= 0);
  if (!vs.length) return 0; return vs.length === 1 ? vs[0] : vs[vs.length - 2];
}
// ---------- английские слова: как звучат русскими буквами ----------
const isLat = w => /^[a-z]/.test(w);
const SUF = [[/'s$/, 'с'], [/s$/, 'с'], [/in'?$/, 'ин'], [/ing$/, 'инг'], [/ers$/, 'ерс'], [/er$/, 'ер'], [/ed$/, 'д'], [/y$/, 'и']];
const TR = [['sch','ш'],['tion','шен'],['igh','ай'],['sh','ш'],['ch','ч'],['ph','ф'],['th','с'],['ck','к'],['qu','кв'],['oo','у'],['ee','и'],['ea','и'],['ou','ау'],['ow','оу'],['ai','ей'],['ay','ей'],['oy','ой'],['wh','в'],['a','а'],['b','б'],['c','к'],['d','д'],['e','е'],['f','ф'],['g','г'],['h','х'],['i','и'],['j','дж'],['k','к'],['l','л'],['m','м'],['n','н'],['o','о'],['p','п'],['q','к'],['r','р'],['s','с'],['t','т'],['u','у'],['v','в'],['w','в'],['x','кс'],['y','и'],['z','з']];
function soundOf(w){
  if (!isLat(w)) return { s:w, si:guessStress(w), src:'ru' };
  const mine = R.pron[w]; if (mine) { const si = mine.indexOf('^'); return { s:mine.replace('^', ''), si:Math.max(0, si), src:'mine' }; }
  if (ABBR.has(w)) return { ...ABBR.get(w), src:'base' };
  const hit = R.engBy.get(w); if (hit) return { ...hit, src:'base' };
  for (const [re, add] of SUF) { if (!re.test(w)) continue; const b = w.replace(re, '');
    for (const x of [b, b + 'e', b.replace(/(.)\1$/, '$1'), b + 'g']) { const h = x.length > 1 && R.engBy.get(x); if (h) return { s:h.s + add, si:h.si, src:'base' }; } }
  let s = '', r = w.replace(/[^a-z]/g, ''); if (r.length > 3) r = r.replace(/([^aeiouy])e$/, '$1');
  while (r) { const t = TR.find(x => r.startsWith(x[0])); s += t[1]; r = r.slice(t[0].length); }
  return { s, si:guessStress(s), src:'guess' };
}
const sylS = s => syl(s.replace(/оу|ау/g, 'а').replace(/^у(?=[аеёиоэ])/, ''));
function findEng(s, si, raw){
  const tl = tail(s, si), sk = skelOf(tl), ok = x => x.w !== raw && x.s !== s;
  const endMatch = x => { let n = 0; for (let a = tl.length - 1, b = x.length - 1; a >= 0 && b >= 0 && tl[a] === x[b]; a--, b--) n++; return n; };
  const exact = (R.engKey.get(tl) || []).map(i => R.eng[i]).filter(ok).slice(0, 30), ex = new Set(exact);
  const near = (R.engSkel.get(sk) || []).map((i, n) => [R.eng[i], n]).filter(x => ok(x[0]) && !ex.has(x[0])).map(x => [x[0], endMatch(x[0].tl), x[1]]).filter(x => x[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 24).map(x => x[0]);
  return { exact, near };
}
// рифмы, за которыми стоит карточка: само слово есть в словаре или рифма спрятана в крючке
function rhymeMeaning(so, raw, about){
  const tl = tail(so.s, so.si), sk = skelOf(tl), need = Math.max(2, 2 * tl.length - 2), self = stem(raw), mat = new Map(material(about || '', 60).map((x, k) => [x.i, 60 - k]));
  const out = new Map(); const add = (w, ci, sc, kind, hook) => { const k = ci; const o = out.get(k); if (!o || o.sc < sc) out.set(k, { w, ci, sc, kind, hook }); };
  (R.skel.get(sk) || []).slice(0, 3500).forEach((i, n) => { const w = R.words[i]; if (w.length < 3 || stem(w) === self) return; const x = tail(w, R.si[i]), lk = likeness(tl, x); if (lk < need - 2) return;
    const ci = cardByHead(w); if (ci === null) return; add(w, ci, lk * 2 + (x === tl ? 4 : 0) + (mat.has(ci) ? 3 : 0) - n / 2000, x === tl ? 'точная' : 'созвучие'); });
  R.dict.forEach(x => { if (x.sk !== sk) return; const lk = likeness(tl, x.tl), c = D.cards[x.ci]; if (lk < need - 1 || c.b === 40 || [35, 36, 37, 38].includes(c.b) || stem(x.w) === self) return; add(insertForm(c), x.ci, lk * 2 + (x.tl === tl ? 4 : 0) + (mat.has(x.ci) ? 3 : 0) - .5, x.tl === tl ? 'точная' : 'созвучие'); });
  hookTails().forEach(h => { if (h.tl !== tl || h.st === self) return; const c = D.cards[h.ci]; add(h.w, h.ci, 2 * tl.length * 2 + 1 + (mat.has(h.ci) ? 4 : 0), 'в крючке', h.s); });
  return [...out.values()].sort((a, b) => b.sc - a.sc).slice(0, 40);
}
let HT = null; function hookTails(){ if (HT && HT.n === D.cards.length) return HT.list; const list = [];
  D.cards.forEach((c, ci) => { if ([35, 36, 37, 38, 40].includes(c.b)) return; hookList(c).forEach(s => { const ws = toks(s.replace(/\*\*/g, '')); const last = ws[ws.length - 1]; ws.forEach(w => { if (w.length < 3 || /^[a-z]/.test(w) || !R.byWord.has(w)) return; if (w !== last && w.length < 4) return; list.push({ w, st:stem(w), tl:tail(w, R.byWord.get(w)), ci, s }); }); }); });
  HT = { n:D.cards.length, list }; return list; }
function setPron(w, s, si){ R.pron[w] = s.slice(0, si) + '^' + s.slice(si); kvSet('pron', R.pron); }
// похожесть концов: сколько звуков подряд по порядку общих, минус разница в длине («френдс» ближе к «момент», чем к «здесь»)
function likeness(a, b){ const m = Array(b.length + 1).fill(0); for (const x of a) { let p = 0; for (let j = 1; j <= b.length; j++) { const q = m[j]; m[j] = x === b[j - 1] ? p + 1 : Math.max(m[j], m[j - 1]); p = q; } }
  return 2 * m[b.length] - Math.abs(a.length - b.length); }
function findRhymes(w, si, like){
  const tl = tail(w, si), sk = skelOf(tl), self = w.replace(/ё/g, 'е');
  const same = x => x.replace(/ё/g, 'е') === self;
  const exact = (R.key.get(tl) || []).filter(i => !same(R.words[i])).slice(0, 60).map(i => R.words[i]);
  const ex = new Set(exact);
  // созвучия: тот же рисунок гласных от ударения; выше — у кого больше совпадает конец
  const endMatch = x => { let n = 0; for (let a = tl.length - 1, b = x.length - 1; a >= 0 && b >= 0 && tl[a] === x[b]; a--, b--) n++; return n; };
  const near = (R.skel.get(sk) || []).filter(i => !same(R.words[i]) && !ex.has(R.words[i])).slice(0, 2500)
    .map(i => { const x = tail(R.words[i], R.si[i]); return [i, like ? likeness(tl, x) : endMatch(x)]; }).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 60).map(x => R.words[x[0]]);
  const dict = R.dict.filter(x => x.tl === tl || x.sk === sk).sort((a, b) => (b.tl === tl) - (a.tl === tl)).slice(0, 20);
  return { exact, near, dict };
}
// заглавная гласная внутри слова — ударение: «фЭйм», «сЕмь»
const HINTS = new Map();
// сокращения большими буквами читаем по буквам: DM — «ди-эм»
const LET = { A:'эй', B:'би', C:'си', D:'ди', E:'и', F:'эф', G:'джи', H:'эйч', I:'ай', J:'джей', K:'кей', L:'эл', M:'эм', N:'эн', O:'оу', P:'пи', Q:'кью', R:'ар', S:'эс', T:'ти', U:'ю', V:'ви', W:'дабл-ю', X:'экс', Y:'уай', Z:'зи' }, ABBR = new Map();
function hintOf(raw){ if (/^[A-Z]{2,4}$/.test(raw)) { const ls = [...raw].map(c => LET[c]), pre = ls.slice(0, -1).join(''), last = ls[ls.length - 1]; ABBR.set(raw.toLowerCase(), { s:pre + last, si:pre.length + [...last].findIndex(c => VS.includes(c)) }); return; }
  if (!/[а-яё]/.test(raw) || !/.[АЕЁИОУЫЭЮЯ]/.test(raw)) return; const p = plain(raw), k = [...p].findIndex((c, i) => i > 0 && 'АЕЁИОУЫЭЮЯ'.includes(c)); if (k > 0) HINTS.set(p.toLowerCase(), k); }
function lastWordOf(s){ (String(s).match(/[А-Яа-яЁё][А-Яа-яЁё-]*|[A-Za-z]+/g) || []).slice(-1).forEach(hintOf); const m = String(s).toLowerCase().replace(/[’`]/g, "'").match(/[а-яё][а-яё-]*|[a-zà-öø-ÿ][a-zà-öø-ÿ'-]*/g); if (!m) return '';
  const w = plain(m[m.length - 1].replace(/['-]+$/g, '')); return /^[а-яё]/.test(w) ? w : w.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

let tt; function toast(s){ const el = $('#toast'); el.textContent = s; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1800); }

// ---------- старт ----------
(async () => {
  await openDB(); (await loadAll()).forEach(t => texts.set(t.id, t)); await loadLook();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // новая версия поставилась — перезагрузить один раз, чтобы сразу работала она
    // новая версия поставилась: в первые секунды — тихо перезагрузиться; позже — не мешать, сказать
    const had = !!navigator.serviceWorker.controller, t0 = Date.now(); let done = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || done) return; done = true; flushAll();
      if (Date.now() - t0 < 3000 && S.view !== 'text') location.reload(); else toast('Обновление готово — откроется при следующем запуске'); });
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  }
  render();
  STOCK = (await kvGet('stock')) || []; setWood((await kvGet('wood')) || 'block');
  loadTakes().then(() => { if (!takes().length || S.sheet) return; if (S.view === 'text') drawHumRow(); else if (S.tab === 'notes') render(); }).catch(() => {});
  fitKeyboard();
  // словарь и рифмы — заранее, в фоне: чтобы вкладки и «Рифма» открывались сразу
  const idle = window.requestIdleCallback || (f => setTimeout(f, 600));
  idle(() => loadDict().then(() => loadRhymes()).then(() => loadSenses()).then(() => loadEndings()).then(() => loadPunch()).catch(() => {}));
})();
