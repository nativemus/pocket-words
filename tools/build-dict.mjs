// Сборка словаря для приложения.
// node tools/build-dict.mjs <путь к исходному .md> [--no-vectors]
// Пишет: data/dict.json + data/vec.bin (общая часть, идёт в репозиторий)
//        private/personal.json (личная часть, в репозиторий не идёт — закрыта .gitignore)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2];
if (!SRC) { console.error('Укажи путь к исходному .md'); process.exit(1); }
const NO_VEC = process.argv.includes('--no-vectors');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const md = fs.readFileSync(SRC, 'utf8');

// ---------- что считается личным ----------
// Что считается личным — в закрытом файле private/markers.json (в репозиторий не идёт).
const MK = JSON.parse(fs.readFileSync(path.join(ROOT, 'private', 'markers.json'), 'utf8'));
const PERSONAL_BLOCKS = new Set(MK.blocks);
const MARK = MK.mark.map(([src, fl]) => new RegExp(src, fl));
const ARTISTS = new RegExp(MK.artists, 'i');
const PUBLIC_BLOCKS = new Set(MK.publicBlocks || []); // блоки без личного: их не фильтруем
// имена из разбора уходят в личное из любой колонки
const isPersonal = (s) => MARK.some(r => r.test(s)) || ARTISTS.test(s);
const splitSent = s => s.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁ«*"(])/).map(x => x.trim()).filter(Boolean);

// ---------- разбор markdown ----------
const clean = s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\\\|/g, '|').trim();
const cells = line => { const inner = line.trim().replace(/^\||\|$/g, ''); return inner.split(/(?<!\\)\|/).map(c => clean(c)); };

const blocks = []; const cards = []; const personal = { cards: {}, extra: [], removedLog: [] };
let block = null, group = '', header = null, inTable = false;
for (const raw of md.split(/\r?\n/)) {
  const line = raw.trimEnd();
  let m;
  if ((m = line.match(/^## (\d+)\.\s+(.+)$/))) { block = { n: +m[1], title: m[2].replace(/\s*\(.*\)\s*$/, '').trim(), groups: [] }; blocks.push(block); group = ''; header = null; continue; }
  if (/^## /.test(line)) { block = null; header = null; continue; }
  if (block && (m = line.match(/^### (.+)$/))) { group = m[1].trim(); if (/^Проверено/.test(group)) { block = null; } else block.groups.push(group); header = null; continue; }
  if (!block) continue;
  if (/^\|/.test(line)) {
    const c = cells(line);
    if (/^[-:\s|]+$/.test(line.replace(/\|/g, ''))) continue;          // разделитель
    if (!header) { header = c; continue; }
    // строка карточки
    const wcell = c[0] || '';
    const wm = wcell.match(/\*\*(.+?)\*\*\s*(?:\(([^)]*)\))?\s*(.*)$/);
    const word = wm ? wm[1].trim() : wcell.replace(/\*/g, '').trim();
    const say = wm && wm[2] ? wm[2].trim() : '';
    const wordExtra = wm ? wm[3].trim() : '';
    const id = 'b' + block.n + '-' + (cards.filter(x => x.b === block.n).length + personal.extra.filter(x => x.b === block.n).length);
    const fields = [];
    for (let i = 1; i < header.length; i++) if (c[i] && c[i] !== '—') fields.push([header[i], c[i]]);
    if (wordExtra) fields.unshift(['', wordExtra]);
    const pubBlock = PUBLIC_BLOCKS.has(block.n);
    const whole = !pubBlock && (PERSONAL_BLOCKS.has(block.n) || isPersonal(word, false));
    if (whole) { personal.extra.push({ id, b: block.n, g: group, word, say, f: fields }); continue; }
    const pubF = [], privF = [];
    fields.forEach(([label, text], idx) => {
      const hooksCol = idx === fields.length - 1;
      const pub = [], priv = [];
      // колонка «из разбора» и поле с артистом из разбора целиком — личное (точка в «А. Имя» рвёт предложение)
      if (!pubBlock && (/разбор/i.test(label) || ARTISTS.test(text))) priv.push(...splitSent(text));
      else splitSent(text).forEach(s => (!pubBlock && isPersonal(s, hooksCol) ? priv : pub).push(s));
      if (pub.length) pubF.push([label, pub.join(' ')]);
      if (priv.length) { privF.push([label, priv.join(' ')]); personal.removedLog.push(word + ' · ' + label + ': ' + priv.join(' ')); }
    });
    cards.push({ id, b: block.n, g: group, word, say, f: pubF });
    if (privF.length) personal.cards[id] = privF;
  } else if (line.trim() === '' || !/^\|/.test(line)) { header = /^\s*$/.test(line) ? header : null; }
}
// блок без карточек (например, «Тату») оставляем — покажем «скоро»
const counts = {}; cards.forEach(c => counts[c.b] = (counts[c.b] || 0) + 1);
personal.extra.forEach(c => counts[c.b] = (counts[c.b] || 0));
blocks.forEach(b => { b.count = counts[b.n] || 0; if (PERSONAL_BLOCKS.has(b.n)) { b.title = b.title.split(/\s+—\s+/)[0]; b.personal = true; b.groups = []; } });

// ---------- контроль: в общей части не должно остаться маркеров ----------
const leaks = [];
cards.forEach(c => { if (PUBLIC_BLOCKS.has(c.b)) return; const t = c.word + ' ' + c.f.map(x => x[1]).join(' '); MARK.forEach(r => { const mm = t.match(r); if (mm) leaks.push(c.id + ' ' + c.word + ' → ' + mm[0]); }); });

// ---------- смысловые векторы ----------
async function embedAll(list, getText){
  const { pipeline } = await import(new URL('./node_modules/@huggingface/transformers/dist/transformers.node.mjs', import.meta.url).href);
  const ext = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
  const out = []; const B = 32;
  for (let i = 0; i < list.length; i += B) {
    const batch = list.slice(i, i + B).map(x => 'passage: ' + getText(x));
    const r = await ext(batch, { pooling: 'mean', normalize: true }); const d = r.dims[1];
    for (let k = 0; k < batch.length; k++) out.push(Array.from(r.data.slice(k * d, (k + 1) * d)));
    process.stdout.write('\r  векторы: ' + Math.min(i + B, list.length) + ' / ' + list.length);
  }
  process.stdout.write('\n'); return out;
}
const SCALE = 400; // как в браузере: int8 = round(v * 400), клип ±127
const toI8 = vecs => { const d = vecs[0]?.length || 384, a = new Int8Array(vecs.length * d);
  vecs.forEach((v, i) => v.forEach((x, k) => a[i * d + k] = Math.max(-127, Math.min(127, Math.round(x * SCALE))))); return a; };
const textOf = c => (c.word + (c.say ? ' (' + c.say + ')' : '') + '. ' + c.f.map(x => x[1]).join(' ')).replace(/\*\*/g, '').slice(0, 600);

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'private'), { recursive: true });
const meta = { version: 1, built: new Date().toISOString().slice(0, 10), dim: 384, scale: SCALE, model: 'Xenova/multilingual-e5-small q8', blocks, cards };
if (!NO_VEC) {
  const pv = await embedAll(cards, textOf); fs.writeFileSync(path.join(ROOT, 'data', 'vec.bin'), Buffer.from(toI8(pv).buffer));
  const ev = await embedAll(personal.extra, textOf); personal.extraVec = Buffer.from(toI8(ev).buffer).toString('base64');
}
fs.writeFileSync(path.join(ROOT, 'data', 'dict.json'), JSON.stringify(meta));
const P = { version: 1, built: meta.built, kind: 'personal-dictionary', cards: personal.cards, extra: personal.extra, extraVec: personal.extraVec || '', scale: SCALE };
fs.writeFileSync(path.join(ROOT, 'private', 'personal.json'), JSON.stringify(P));
fs.writeFileSync(path.join(ROOT, 'private', 'removed-log.txt'), personal.removedLog.join('\n'));

console.log('Блоков:', blocks.length, '| карточек в общей части:', cards.length, '| целиком личных:', personal.extra.length,
  '| карточек с личными крючками:', Object.keys(personal.cards).length);
console.log('Утечки маркеров в общей части:', leaks.length ? '\n  ' + leaks.join('\n  ') : 'нет');
console.log('Размеры: dict.json', Math.round(fs.statSync(path.join(ROOT, 'data', 'dict.json')).size / 1024), 'КБ',
  NO_VEC ? '' : '| vec.bin ' + Math.round(fs.statSync(path.join(ROOT, 'data', 'vec.bin')).size / 1024) + ' КБ',
  '| personal.json', Math.round(fs.statSync(path.join(ROOT, 'private', 'personal.json')).size / 1024), 'КБ');
