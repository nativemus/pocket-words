// Толкования обычных слов и устойчивые выражения: Викисловарь (CC BY-SA 4.0). Всё в телефоне.
const X = { ready:false, loading:null, sense:new Map(), form:new Map(), phr:[], byHead:new Map() };
const ny = w => w.toLowerCase().replace(/ё/g, 'е').replace(/́/g, '');
export function loadSenses(){
  if (X.loading) return X.loading;
  const get = f => fetch('data/' + f).then(r => r.ok ? r.text() : '').catch(() => '');
  X.loading = Promise.all([get('senses.txt'), get('forms.txt'), get('phrases.txt')]).then(([s, f, p]) => {
    s.split(/\r?\n/).forEach(l => { const i = l.indexOf('\t'); if (i > 0) X.sense.set(ny(l.slice(0, i)), [l.slice(0, i), l.slice(i + 1)]); });
    f.split(/\r?\n/).forEach(l => { const i = l.indexOf('\t'); if (i > 0) X.form.set(ny(l.slice(0, i)), l.slice(i + 1)); });
    p.split(/\r?\n/).forEach(l => { const [a, g, h] = l.split('\t'); if (!h) return; const k = X.phr.push([a, g]) - 1; h.split(',').forEach(w => { const n = ny(w); (X.byHead.get(n) || X.byHead.set(n, []).get(n)).push(k); }); });
    X.ready = X.sense.size > 0; });
  return X.loading;
}
export const sensesReady = () => X.ready;
// слово в любой форме → основная форма и её смыслы
export function sensesOf(word){
  const w = ny(String(word || '')), out = []; if (!X.ready || !w) return null;
  const lem = X.sense.has(w) ? [w] : []; (X.form.get(w) || '').split(',').filter(Boolean).forEach(x => { if (!lem.includes(ny(x))) lem.push(ny(x)); });
  if (!lem.length) return null;
  const [name, raw] = X.sense.get(lem[0]) || []; if (!raw) return null;
  raw.split('|').forEach(g => out.push(split(g)));
  return { lemma:name, list:out, alt:lem.slice(1).map(x => X.sense.get(x)).filter(Boolean).map(([n, r]) => ({ lemma:n, list:r.split('|').map(split) })) };
}
function split(g){ const m = g.match(/^((?:[а-яё]+\. ?ч?\.?,? ?)+)(.+)$/i); let lab = '', t = g;
  if (m && m[2].length > 5) { lab = m[1].trim().replace(/,$/, ''); t = m[2]; }
  t = t.replace(/^о (человеке|людях|животных|предмете)[^:]*: /, ''); return { lab, t }; }
export function phrasesOf(lemma, n = 8){ if (!X.ready) return []; return (X.byHead.get(ny(lemma)) || []).map(k => X.phr[k]).sort((a, b) => a[0].length - b[0].length).slice(0, n).map(([p, g]) => ({ p, g })); }
export const phrasesAll = () => X.phr;
// сколько разных смыслов у слова (само слово плюс омонимы)
export function senseCount(word){ const s = sensesOf(word); return s ? s.list.length + s.alt.reduce((a, x) => a + x.list.length, 0) : 0; }
