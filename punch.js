// «Панч»: слово с двумя смыслами → столкнуть → удар в конце уже известен. Строчки пишет человек.
// Ручная разметка — data/turns.txt, карточки словаря — data/turns-cards.txt, «слышится как» — data/puns.txt; остальное — толкования Викисловаря.
import { toks, stem, STOP, plain } from './engine.js';
import { sensesOf, phrasesOf } from './senses.js';
import { assocOf, expand } from './endings.js';

const P = { ready:false, loading:null, turns:new Map(), puns:new Map(), list:[], stress:new Map() };
const ny = w => String(w).toLowerCase().replace(/ё/g, 'е').replace(/́/g, '');
export function loadPunch(){
  if (P.loading) return P.loading;
  const get = f => fetch('data/' + f).then(r => r.ok ? r.text() : '').catch(() => '');
  P.loading = Promise.all([get('turns.txt'), get('puns.txt'), get('turns-cards.txt')]).then(([a, b, c]) => {
    a.split(/\r?\n/).forEach(l => { const [w, g] = l.split('\t'); if (!g) return; const k = ny(w), s = g.split('|').filter(Boolean), o = P.turns.get(k);
      if (o) s.forEach(x => { if (!o.s.includes(x)) o.s.push(x); }); else { const e = { w:w.replace(/́/g, ''), s, st:new Set(s.flatMap(x => toks(x)).filter(x => x.length > 2 && !STOP.has(x)).map(stem)) }; P.turns.set(k, e); P.list.push(e); } });
    b.split(/\r?\n/).forEach(l => { const [w, s] = l.split('\t'); if (s) P.puns.set(ny(w), s); });
    c.split(/\r?\n/).forEach(l => { const [w0, al, card, g] = l.split('\t'); if (!g) return; const w = w0.replace('^', ''), k = ny(w), s = g.split('|'), o = P.turns.get(k), al2 = (al || '').split(',').filter(Boolean);
      if (w0.includes('^')) P.stress.set(w.toLowerCase(), w0.indexOf('^'));
      const st = s.flatMap(x => toks(x)).filter(x => x.length > 2 && !STOP.has(x)).map(stem), e = o || { w, s:[], st:new Set() };
      s.forEach(x => { if (!e.s.includes(x)) e.s.push(x); }); st.forEach(x => e.st.add(x)); e.al = al2; e.card = card;
      if (!o) { P.turns.set(k, e); P.list.push(e); } al2.forEach(x => { if (!P.turns.has(ny(x))) P.turns.set(ny(x), e); }); });
    P.ready = P.turns.size > 0; });
  return P.loading;
}
export const punchReady = () => P.ready;
export const punchStress = w => P.stress.get(w);
const lemmaOf = w => { const s = sensesOf(w); return s ? s.lemma : w; };
let BS = null; const byStem = w => { if (!BS) { BS = new Map(); P.list.forEach(e => { const k = stem(e.w); if (!BS.has(k)) BS.set(k, e); }); } const k = stem(w), e = k.length > 3 ? BS.get(k) : null; return e && Math.abs(e.w.length - w.length) < 4 ? e : null; };
export const marked = w => P.turns.get(ny(w)) || P.turns.get(ny(lemmaOf(w))) || byStem(ny(w)) || null;
export const punOf = w => P.puns.get(ny(w)) || '';
// разные по смыслу толкования: близкие повторы выбрасываем
function distinct(list, max = 6){ const out = [], bag = x => new Set(toks(x.t).filter(w => w.length > 3 && !STOP.has(w)).map(stem));
  for (const x of list) { if (x.t.length > 78) continue; const b = bag(x); if (!b.size) continue; if (out.some(o => { let n = 0; b.forEach(v => { if (o.b.has(v)) n++; }); return n / Math.min(b.size, o.b.size) > .34; })) continue; out.push({ ...x, b }); if (out.length >= max) break; } return out; }
// все смыслы слова: своё, звук, словарь, выражения
export function turnsOf(word){
  const out = [], m = marked(word), p = punOf(word), se = sensesOf(word);
  if (m) m.s.forEach(t => out.push({ t, src:'' }));
  if (p) out.push({ t:'слышится «' + p + '»', src:'звучит так же' });
  if (se) { const ls = distinct(se.list.concat(se.alt.flatMap(a => a.list)), m ? 3 : 6); const have = new Set(out.flatMap(x => toks(x.t)).map(stem));
    ls.forEach(x => { if (m && !/перен|разг|жарг|мол|прост/.test(x.lab)) return; if (m && [...x.b].some(v => have.has(v))) return; out.push({ t:x.t, src:x.lab || 'словарь' }); });
    phrasesOf(se.lemma, 40).filter(x => !/обсц|вульг|сексол|бран/.test(x.g) && !toks(x.p).some(w => stem(w) !== stem(word) && w.length > 2 && have.has(stem(w)))).sort((a, b) => /перен|разг/.test(b.g) - /перен|разг/.test(a.g)).slice(0, m ? 3 : 4).forEach(x => out.push({ t:x.p, src:'выражение', g:x.g })); }
  return out;
}
// кандидаты к строке. topics — слова темы (строка, перевод, названия блоков и карточек)
export function candidates(line, topics, opts = {}){
  const own = [...new Set(toks(line).filter(w => w.length > 2 && !STOP.has(w)))], ownSt = new Set(own.map(stem)), top = new Set(topics.filter(w => w.length > 2 && !STOP.has(w)).map(stem)), strong = new Set((opts.strong || []).filter(w => w.length > 2 && !STOP.has(w)).map(stem));
  const near = new Map(); own.flatMap(w => assocOf(w).slice(0, 12)).concat(topics.slice(0, 6).flatMap(w => assocOf(w).slice(0, 5))).forEach((w, i) => { const k = stem(w); if (!near.has(k)) near.set(k, i); });
  let sd = opts.seed || 1; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const out = [];
  own.forEach(w => { const ts = turnsOf(w), n = ts.length; if (n > 1 && (marked(w) || punOf(w) || !/^(город|столиц|река|посёл|село|правител|имя|фамил)/.test(ts[0].t)) && (marked(w) || punOf(w) || n > 2)) out.push({ w, sc:(marked(w) || punOf(w) ? 9 : 4.5) + rnd(), own:true }); });
  P.list.forEach(e => { const k = stem(e.w); if (ownSt.has(k)) return; let sc = 0, hit = '';
    e.st.forEach(v => { if (ownSt.has(v) || strong.has(v)) { sc += 3.4; hit = hit || v; } else if (top.has(v)) { sc += .9; hit = hit || v; } else if (near.has(v)) sc += .8; });
    if (e.card && opts.cards && opts.cards.has(e.card)) sc += opts.cards.get(e.card);
    if (e.al && e.al.some(x => ownSt.has(stem(x)))) return; if (top.has(k) || (e.al && e.al.some(x => top.has(stem(x))))) sc += 2.5; if (near.has(k)) sc += 2.2 - Math.min(1, near.get(k) * .02);
    const rh = opts.rhyme ? opts.rhyme(e.w) : 0; if (rh) sc += 1.2 + rh * .8;
    out.push({ w:e.w, card:e.card || '', sc:Math.min(sc, 7) + rnd() * 1.1 + (e.s.length > 2 ? .25 : 0), rh, rel:sc > 0 }); });
  return out.sort((a, b) => b.sc - a.sc).slice(0, opts.max || 40).map(x => ({ ...x, card:x.card || (marked(x.w) || {}).card || '', turns:(marked(x.w) ? marked(x.w).s : turnsOf(x.w).map(t => t.t)).slice(0, 5), n:turnsOf(x.w).length }));
}
// слова, которыми можно вести к смыслу
export function leadWords(word, sense, n = 10){
  const heard = /слышится|внутри слова/.test(sense), ts = toks(sense.replace(/слышится|внутри слова|почти|рифма/g, ' ')).filter(w => w.length > 2 && !STOP.has(w) && (heard ? w !== word : stem(w) !== stem(word))), out = [];
  ts.forEach(w => { const l = lemmaOf(w); if (!out.includes(l)) out.push(l); });
  const as = ts.map(w => assocOf(w)); for (let i = 0; i < 8; i++) as.forEach(a => { const x = a[i]; if (x && !out.includes(x) && !/(ый|ий|ой|ая|ое|ые)$/.test(x) && stem(x) !== stem(word)) out.push(x); });
  if (out.length < 5) assocOf(word).slice(0, 8).forEach(x => { if (!out.includes(x)) out.push(x); });
  return out.slice(0, n);
}
