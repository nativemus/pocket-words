// Подбор материала к строке: без сети и без модели. Корни слов → карточки словаря → соседи по теме.
export const STOP = new Set(('и в во на не ни что как я ты мы вы он она оно они это этот эта эти за по с со из к ко у же бы б а но да там тут так то мой моя мое мои твой твоя ' +
  'свой своя свои наш наша его ее их себя меня тебя нас вас мне тебе им ей ему нам вам все всё всех всем весь вся или если когда где кто чем для до от под над при про без был была были ' +
  'том тем той тот те ту стал стала стало стать будто даже такой такая такое такие сегодня нужно надо может могу хочу чтобы вот себе ' +
  'быть есть нет уже еще ещё только снова опять тоже потом теперь сейчас очень просто день дня дни новый новая новые новое один одна два раз the a an and to of in on my me you i it is not no').split(' '));
const END = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ешь|ишь|ают|яют|ает|яет|ией|ть|ой|ей|ом|ем|ам|ям|ах|ях|ые|ие|ый|ий|ая|яя|ое|ее|ую|юю|ов|ев|ут|ют|ат|ят|ет|ит|ла|ло|ли|ы|и|а|я|у|ю|о|е|ь|й)$/;
const NOUN = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ой|ей|ом|ем|ам|ям|ах|ях|ые|ие|ый|ий|ая|яя|ое|ее|ую|юю|ов|ев|ы|и|а|я|у|ю|о|е|ь|й)$/;
const headStem = w => { w = w.toLowerCase().replace(/ё/g, 'е').replace(/́/g, ''); return /^[a-z]/.test(w) || w.length < 4 ? w : w.replace(NOUN, ''); };
const cache = new Map();
export function stem(w){
  w = w.toLowerCase().replace(/ё/g, 'е').replace(/́/g, ''); const hit = cache.get(w); if (hit !== undefined) return hit;
  let s = w;
  if (/^[a-z]/.test(w)) { s = w.replace(/'s$/, ''); if (s.length > 4) s = s.replace(/(ing|in'|ed|es|s)$/, ''); }
  else if (w.length > 3) { const c = w.replace(w.length > 5 ? END : NOUN, ''); s = c.length >= 3 ? c : w.length >= 4 ? w.slice(0, 3) : w; }
  cache.set(w, s); return s;
}
// протяжные буквы: «ту-у-ускло», «ю-юность», «туууускло» → «тускло», «юность»
export const plain = w => String(w).replace(/([аеёиоуыэюяaeiouy])(?:-+\1)+/gi, '$1').replace(/([а-яёa-z])\1{2,}/gi, '$1');
export const toks = s => (String(s).toLowerCase().replace(/́/g, '').match(/[а-яё]+(?:-[а-яё]+)*|[a-z][a-z']*/g) || []).map(plain);
const strip = s => String(s || '').replace(/\*\*/g, '');
// «Роза ветров, компас» → «Роза ветров»; «Мейбах (Maybach)» → «Мейбах»
export const headOf = w => { const s = String(w), q = s.indexOf('«'); const cut = x => x.replace(/[«»"“”„]/g, '').split(/\s*[,/(—:]\s*/)[0].trim();
  // «Маски «смейся сейчас, плачь потом»»: если кавычки открыты посреди названия — берём то, что до них
  if (q > 0 && /[,/(—:]/.test(s.slice(q))) return cut(s.slice(0, q)); return cut(s); };
export const hooksOf = c => { const all = [...(c.mine || []), ...c.f]; const h = all.filter(f => /крюч/i.test(f[0])); const src = h.length ? h : all.slice(-1); return src.map(f => f[1]); };
// самая сильная фраза крючка: жирное предложение целиком, иначе первое
export function bestHook(c){
  const t = hooksOf(c).join(' '); if (!t) return '';
  const parts = t.split(/(?<=[.!?…])\s+/); return parts.find(p => p.includes('**')) || parts[0] || '';
}
export const hookList = c => hooksOf(c).join(' ').split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(s => strip(s).length > 8);

const IDX = { cards:null, inv:new Map(), head:new Map(), n:0, stems:[] };
const SKIP = new Set([35, 36, 37, 38, 40]); // вопросы, заходы, концовки, переходы — не материал
export function buildIndex(cards){
  IDX.cards = cards; IDX.inv = new Map(); IDX.head = new Map(); IDX.n = cards.length;
  cards.forEach((c, i) => {
    if (SKIP.has(c.b)) return;
    const w = new Set(toks(c.word + ' ' + (c.say || '')).filter(x => x.length > 1 && !STOP.has(x)).map(stem));
    const t = new Set([...c.f, ...(c.mine || [])].flatMap(f => toks(f[1])).filter(x => x.length > 2 && !STOP.has(x)).map(stem));
    new Set([...w, ...t]).forEach(s => { (IDX.inv.get(s) || IDX.inv.set(s, []).get(s)).push([i, w.has(s) ? 1 : 0]); });
    const h = toks(headOf(c.word)); if (h.length === 1) { const s = headStem(h[0]); if (s.length > 1 && !IDX.head.has(s)) IDX.head.set(s, i); }
  });
  IDX.stems = [...IDX.inv.keys()];
}
export const cardByHead = word => { const i = IDX.head.get(headStem(word)); return i === undefined ? null : i; };
// близкие формы корня: «мороз» и «морозн», «трайбл» и «трайбл»
function family(s){ if (s.length < 4) return IDX.inv.has(s) ? [s] : []; return IDX.stems.filter(x => x === s || (x.length >= 4 && Math.abs(x.length - s.length) <= 2 && (x.startsWith(s) || s.startsWith(x)))); }
export function material(text, n = 24){
  if (!IDX.cards) return [];
  const qs = [...new Set(toks(text).filter(x => x.length > 2 && !STOP.has(x)).map(stem))], sc = new Map(), why = new Map();
  qs.forEach(q => family(q).forEach(s => { const list = IDX.inv.get(s), idf = Math.log(IDX.n / (1 + list.length)), k = s === q ? 1 : .7;
    if (idf < 1.5) return;
    list.forEach(([i, inWord]) => { sc.set(i, (sc.get(i) || 0) + idf * k * (inWord ? 3 : 1)); if (inWord) why.set(i, 1); }); }));
  // соседи: карточки той же группы, что и прямые попадания в слово
  const top = [...sc].filter(x => why.has(x[0])).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const base = new Map(sc);
  top.forEach(([i, s], rank) => { const c = IDX.cards[i]; if (!c.g) return; let left = 6;
    const around = IDX.cards.map((x, j) => j).filter(j => j !== i && IDX.cards[j].b === c.b && IDX.cards[j].g === c.g && !base.has(j)).sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
    for (const j of around) { if (!left--) break; sc.set(j, Math.max(sc.get(j) || 0, s * .12 - rank * .1 - (6 - left) * .02)); } });
  return [...sc].sort((a, b) => b[1] - a[1]).slice(0, n).map(([i, s]) => ({ i, s, direct: why.has(i), near: !base.has(i) }));
}

// ---------- куски заметки: три Enter и больше — отдельная мысль ----------
// на строке i рисуем разделитель: последняя из двух и более пустых, выше есть текст
export function isSep(lines, i){
  const e = j => !(lines[j] || { t:'' }).t.trim();
  if (i < 2 || !e(i) || !e(i - 1) || i === lines.length - 1) return false;
  if (e(i + 1) && i + 1 !== lines.length - 1) return false;
  for (let j = i - 2; j >= 0; j--) if (!e(j)) return true;
  return false;
}
export function fragOf(lines, i){
  let a = i, b = i;
  while (a > 0 && !isSep(lines, a - 1)) a--;
  while (b < lines.length - 1 && !isSep(lines, b)) b++;
  return [a, b];
}
