// «Концовка»: чем закончить начатую строку. Всё в телефоне: субтитры (что ждут), Викисловарь (выражения, антонимы), словарь.
import { toks, stem, STOP } from './engine.js';
import { sensesOf, phrasesAll, phrasesOf } from './senses.js';

const N = { ready:false, loading:null, next:new Map(), assoc:new Map(), frames:new Map(), anti:new Map() };
const ny = w => String(w).toLowerCase().replace(/ё/g, 'е').replace(/́/g, '');
export function loadEndings(){
  if (N.loading) return N.loading;
  const get = f => fetch('data/' + f).then(r => r.ok ? r.text() : '').catch(() => '');
  const put = (txt, map, sep) => txt.split(/\r?\n/).forEach(l => { const i = l.indexOf('\t'); if (i > 0) map.set(ny(l.slice(0, i)), l.slice(i + 1)); });
  N.loading = Promise.all(['next.txt', 'assoc.txt', 'frames.txt', 'anti.txt'].map(get)).then(([a, b, c, d]) => { put(a, N.next); put(b, N.assoc); put(c, N.frames); put(d, N.anti); N.ready = N.next.size > 0; });
  return N.loading;
}
export const endingsReady = () => N.ready;

// английские слова строки → по-русски, чтобы искать по смыслу
const EN = { skill:'навык талант умение', skills:'навык талант умение', money:'деньги', cash:'деньги', love:'любовь', game:'игра', life:'жизнь', city:'город', town:'город', hood:'район двор', street:'улица', streets:'улица', friend:'друг', friends:'друг', bro:'брат', brother:'брат', sister:'сестра', mama:'мама', dream:'мечта сон', dreams:'мечта сон', heart:'сердце', time:'время', night:'ночь', day:'день', power:'сила', style:'стиль', flow:'поток', king:'король', queen:'королева', boss:'босс начальник', star:'звезда', stars:'звезда', world:'мир', war:'война', peace:'мир', pain:'боль', fire:'огонь', ice:'лёд', water:'вода', blood:'кровь', soul:'душа', mind:'разум', brain:'мозг', body:'тело', eyes:'глаз', face:'лицо', hand:'рука', hands:'рука', god:'бог', devil:'дьявол', angel:'ангел', demon:'демон', hell:'ад', heaven:'рай', truth:'правда', lie:'ложь', lies:'ложь', trust:'доверие', loyalty:'верность', respect:'уважение', fear:'страх', hate:'ненависть', hater:'враг', haters:'враг', enemy:'враг', team:'команда', gang:'банда', squad:'команда', family:'семья', home:'дом', house:'дом', car:'машина', cars:'машина', road:'дорога', way:'путь', road_:'', speed:'скорость', work:'работа', job:'работа', hustle:'работа', grind:'работа', business:'бизнес дело', price:'цена', gold:'золото', diamond:'бриллиант', diamonds:'бриллиант', chain:'цепь', watch:'часы', shoes:'обувь', drip:'стиль одежда', swag:'стиль', fashion:'мода', party:'вечеринка', club:'клуб', smoke:'дым', drink:'напиток', drunk:'пьяный', high:'высоко', girl:'девушка', girls:'девушка', girlfriend:'девушка', baby:'малыш', kiss:'поцелуй', sex:'секс', music:'музыка', song:'песня', track:'трек', beat:'бит', bass:'бас', mic:'микрофон', stage:'сцена', show:'шоу', fan:'фанат', fans:'фанат', fame:'слава', hype:'шум', vibe:'настроение', mood:'настроение', feeling:'чувство', feelings:'чувство', memory:'память', memories:'память', past:'прошлое', future:'будущее', now:'сейчас', past_:'', win:'победа', winner:'победитель', loser:'неудачник', loss:'поражение', goal:'цель', shot:'бросок выстрел', ball:'мяч', court:'площадка', basketball:'баскетбол', player:'игрок', coach:'тренер', rookie:'новичок', champion:'чемпион', ring:'кольцо', crown:'корона', shadow:'тень', light:'свет', dark:'тьма', sun:'солнце', moon:'луна', sky:'небо', rain:'дождь', snow:'снег', winter:'зима', summer:'лето', sea:'море', ocean:'океан', mountain:'гора', wolf:'волк', lion:'лев', snake:'змея', dog:'собака', cat:'кошка', bird:'птица', key:'ключ', door:'дверь', wall:'стена', mask:'маска', mirror:'зеркало', phone:'телефон', camera:'камера', photo:'фото', picture:'картина', story:'история', secret:'тайна', problem:'проблема', problems:'проблема', question:'вопрос', answer:'ответ', rule:'правило', rules:'правило', law:'закон', crime:'преступление', cop:'коп', police:'полиция', prison:'тюрьма', freedom:'свобода', luck:'удача', chance:'шанс', risk:'риск', bet:'ставка', poker:'покер', joker:'джокер', level:'уровень', hero:'герой', legend:'легенда', boy:'парень', man:'мужчина', woman:'женщина', kid:'ребёнок', kids:'ребёнок', school:'школа', lesson:'урок', teacher:'учитель', book:'книга', word:'слово', words:'слово', name:'имя', tattoo:'татуировка', hoodie:'худи' };
export const translate = w => (EN[w] || '').split(' ').filter(Boolean);
export const expand = text => toks(text).flatMap(w => /^[a-z]/.test(w) ? [w, ...translate(w)] : [w]).join(' ');

const lemmaOf = w => { const s = sensesOf(w); return s ? s.lemma : null; };
const lemmas = w => /^[a-z]/.test(w) ? translate(w) : [lemmaOf(w) || w];
export const assocOf = w => { for (const l of lemmas(ny(w))) { const a = N.assoc.get(ny(l)); if (a) return a.split(' '); } return []; };
export const antiOf = w => { for (const l of lemmas(ny(w))) { const a = N.anti.get(ny(l)); if (a) return a.split(' '); } return []; };

const PREP = new Set('в во на под над за из изо без с со до от ото к ко у по для про о об при через сквозь между перед ради из-за из-под вокруг вместо кроме среди мимо против'.split(' '));
const SIM = new Set(['как', 'словно', 'будто', 'типа', 'точно']);
const DEF = new Set(['это', 'значит', 'называется', 'есть', 'был', 'была', 'стал', 'стала', 'станет', 'будет']);
// то, что в рамку «мой главный… это» обычно не ставят
const FLIP = 'молчать,опаздывать,забывать,падать,терять,ждать,исчезать,проигрывать,не отвечать,просыпать,уходить первым,возвращаться,прощать,ошибаться,врать себе,не спать,сомневаться,бояться и делать,начинать заново,ломать,отпускать,слушать,не верить на слово,стоять в стороне,сидеть на скамейке,мазать в концовке,тратить последнее,помнить лишнее,влюбляться не вовремя,не брать трубку,закрывать глаза,сжигать мосты,быть чужим,быть вторым,выживать,терпеть,делать вид,казаться спокойным,смеяться не к месту,держать в себе,уходить в себя,портить праздники,говорить правду,говорить поздно,не извиняться,извиняться,просить помощи,не просить,искать виноватых,быть не собой,быть собой,путать имена,собирать долги,платить за всех,приходить без звонка,пропадать с радаров,засыпать под утро,не досматривать,бросать на середине,бросать курить,держать обещания,не держать слово,верить людям,не верить людям,быть рядом,быть далеко,жить вчера,жить на чемоданах'.split(',');

const ADJ = /(ый|ий|ой|ая|яя|ое|ее|ые|ие|ного|ному|нным)$/;
const BADSIM = new Set('дела могу мог смогу дети люди другие всегда обычно раньше нельзя хочешь человек мужчина женщина'.split(' '));
// темы → блоки словаря, откуда брать образы, если прямых попаданий мало
const TOPIC = [[/^(навык|талант|умение|дар|игр|спорт|мяч|баскетбол|бросок|тренер|площадк|побед|матч|команд|соперник)/, [28, 21, 20]], [/^(деньг|цен|богат|бабк|кэш|рубл|доллар|работ|бизнес|долг)/, [15, 16, 3, 10, 20]], [/^(любов|девушк|женщин|поцелу|сердц|чувств|ревност|измен|верност|душ)/, [29, 4, 33, 39, 13]],
  [/^(город|улиц|район|двор|дом|москв|дорог|путь|машин|скорост)/, [7, 8, 6, 10]], [/^(ноч|сон|мечт|неб|звезд|космос|свет|тьм|тен)/, [17, 30, 31, 33]], [/^(стил|одежд|мод|вещ|цеп|часы|бренд|внешност)/, [1, 2, 3, 5, 16, 39]], [/^(враг|войн|драк|удар|злост|ненавист|предат|боль|страх|смерт)/, [21, 13, 25, 39, 29]],
  [/^(вер|бог|душ|рай|ад|грех|ангел|демон|судьб)/, [32, 13]], [/^(слав|сцен|музык|трек|песн|бит|рэп|альбом|микрофон)/, [22, 26, 39, 12]], [/^(детств|мам|отец|семь|школ|памят|прошл)/, [14, 12, 25]], [/^(холод|мороз|снег|зим|дожд|лет|ветер|погод)/, [30, 8, 33]], [/^(время|час|день|год|возраст|жизн)/, [31, 3, 13, 17]], [/^(тату|трайбл|игл|шрам|кож)/, [39, 29]], [/^(алкогол|вин|пить|вечеринк|клуб|дым)/, [11, 6, 4]]];
const SPARK = [28, 39, 20, 17, 30, 10, 13, 21, 16];
export function topicBlocks(f){ const ws = [f.head, ...f.content].flatMap(w => lemmas(w)).map(ny); for (const w of ws) for (const [re, b] of TOPIC) if (re.test(w)) return { b, spark:false }; for (const w of ws) for (const a of assocOf(w).slice(0, 8)) for (const [re, b] of TOPIC) if (re.test(ny(a))) return { b, spark:false }; return { b:SPARK, spark:true }; }
const tail2 = (ws, i) => ws.slice(i).join(' ');
export function frameOf(line){
  const t = line.replace(/[«»"“”.,!?…:;]+\s*$/g, '').trimEnd(), dash = /[—–-]\s*$/.test(line.trimEnd()), ws = toks(t), last = ws[ws.length - 1] || '';
  const content = ws.filter(w => w.length > 2 && !STOP.has(w) && !DEF.has(w) && !SIM.has(w) && !PREP.has(w));
  let kind = 'open', head = content[content.length - 1] || '';
  if (dash || DEF.has(last)) kind = 'def'; else if (SIM.has(last)) kind = 'sim'; else if (PREP.has(last)) kind = 'prep';
  if (kind === 'prep' || kind === 'sim') { const before = ws[ws.length - 2] || ''; if (before && !STOP.has(before) && before.length > 2) head = before; }
  return { kind, last, head, ws, content };
}
function rnd(seed){ let h = seed * 2654435761 >>> 0; return () => { h = Math.imul(h ^ h >>> 15, 2246822519) >>> 0; h = (h + 0x9E3779B9) >>> 0; return ((h ^ h >>> 13) >>> 0) / 4294967296; }; }
let INF = null;
const infPhrases = () => INF || (INF = phrasesAll().filter(([p]) => /^(не )?[а-яё]+(ть|ться|ти|чь|чься)( |$)/.test(p) && p.split(' ').length > 1 && !/сексол|обсц|вульг/.test(p)).map(([p, g]) => ({ p, g, st:toks(p + ' ' + g).map(stem) })));
const FUNC = /употребля|вводн|союз|частиц|то же самое|во всяком случае|служебн|в каком состоянии/;
const COLOR = g => (/перен|разг|экспр|ирон|жарг|мол\./.test(g) ? .9 : 0) - (/морск|карт\.|крим|воен|спец|юр\.|техн|офиц|канц|устар/.test(g) ? 1.2 : 0);
const NOISE = /обсц\.|вульг\.|сексол\.|бран\./;
// что слушатель ждёт
function waiting(f){
  const out = [], add = s => (s || '').split(f.kind === 'def' || f.kind === 'sim' ? '|' : ' ').forEach(x => { if (x && !out.includes(x)) out.push(x); });
  const hs = f.head ? lemmas(f.head) : [];
  if (f.kind === 'def') { hs.forEach(l => add(N.frames.get('э|' + ny(l)))); const inf = x => /(ть|ться|ти|чь)$/.test(x.split(' ')[0]) && !/(сть|пить|путь|роль|смерть|мысль|жизнь|ночь|помощь|речь|вещь|дочь|печь|мать|кровать|тетрадь)$/.test(x); out.sort((x, y) => inf(x) - inf(y)); if (out.filter(x => !inf(x)).length < 3) for (let q = out.length - 1; q >= 0; q--) if (inf(out[q])) out.splice(q, 1); if (out.length < 6) hs.forEach(l => assocOf(l).filter(x => !ADJ.test(x) && !inf(x)).slice(0, 7).forEach(x => { if (!out.includes(x)) out.push(x); })); }
  else if (f.kind === 'sim') { hs.forEach(l => add(N.frames.get('к|' + ny(l)))); if (out.length < 5) add(N.frames.get('к|*')); for (let i = out.length - 1; i >= 0; i--) if (BADSIM.has(out[i])) out.splice(i, 1); }
  else { hs.forEach(l => { if (f.head !== f.last) add(N.next.get(ny(l) + '|' + ny(f.last))); }); const i = f.ws.length - 2; if (i >= 0 && f.kind === 'open') lemmas(f.ws[i]).forEach(l => add(N.next.get(ny(l) + '|' + ny(f.last)))); add(N.next.get('|' + ny(f.last))); }
  const own = new Set(f.ws.flatMap(w => lemmas(w)).map(ny)); return out.filter(x => !own.has(ny(lemmaOf(x) || x)) && !/^(эт|так|как|котор|люб(ой|ого)|кажд|друг(ой|ого|ую|их)$|свою?$|ху[йяе]|хер$|хрен$|вирджин)/.test(x) && !STOP.has(x)).slice(0, 14);
}
function expressions(f, seed){
  const hits = [], r = rnd(seed + 7), out = [], seen = new Set(), add = (t, full, g) => { const k = t.toLowerCase(); if (!t || seen.has(k) || NOISE.test(g) || FUNC.test(g) || toks(t).every(w => STOP.has(w) || w.length < 3)) return; seen.add(k); out.push({ t, full, g }); };
  if (f.kind !== 'def' && f.kind !== 'sim' && f.head) for (const l of lemmas(f.head)) {
    phrasesOf(l, 80).forEach(({ p, g }) => { const ws = p.split(' '); const i = ws.findIndex(w => ny(lemmaOf(w) || w) === ny(l)); if (i < 0 || i === ws.length - 1) return;
      let rest = ws.slice(i + 1); if (f.kind === 'prep') { if (ny(rest[0]) !== ny(f.last) || rest.length < 2) return; rest = rest.slice(1); } hits.push([COLOR(g) + r() * .6 + (i === 0 ? .5 : 0), rest.join(' '), p, g]); }); }
  hits.sort((a, b) => b[0] - a[0]).forEach(h => add(h[1], h[2], h[3]));
  if (f.kind === 'prep') phrasesAll().forEach(([p, g]) => { const ws = p.split(' '); if (ny(ws[0]) === ny(f.last) && ws.length > 1 && ws.length < 5) (out.pool = out.pool || []).push([tail2(ws, 1), p, g]); });
  if (f.kind === 'sim') phrasesAll().forEach(([p, g]) => { const ws = p.split(' '); if (/^(как|словно|будто)$/.test(ws[0]) && ws.length > 1) (out.pool = out.pool || []).push([tail2(ws, 1), p, g]); });
  if (out.pool) { const as = new Set([f.head, ...assocOf(f.head)].map(stem)); out.pool.map(x => [toks(x[0] + ' ' + x[2]).some(w => as.has(stem(w))) ? 2 + r() : r(), x]).sort((a, b) => b[0] - a[0]).slice(0, 24).forEach(([s, x]) => { const n = out.length; add(...x); if (out.length > n) out[n].far = s < 2; }); }
  if (f.kind === 'def' || out.length < 6) { // инфинитивные выражения: сначала родственные теме, потом вразброс
    const topic = new Set(f.content.flatMap(w => [...lemmas(w), ...assocOf(w).slice(0, 10)]).map(stem));
    infPhrases().map(x => [x.st.reduce((a, s) => a + (topic.has(s) ? 1 : 0), 0) + r() * 1.3 + COLOR(x.g) - (/^(не )?(быть|иметь|являться|находиться|делать|стать)( |$)/.test(x.p) ? 1.5 : 0), x]).sort((a, b) => b[0] - a[0]).slice(0, 26).forEach(([s, x]) => { const n = out.length; add(x.p, x.p, x.g); if (out.length > n) out[n].far = s < 1.3; }); }
  return out.slice(0, 24).map(x => ({ t:x.t, full:x.full, g:x.g, far:!!x.far }));
}
function flips(f, seed){
  const r = rnd(seed + 31), out = [];
  (f.kind === 'def' ? [f.head] : f.content.slice(-3).reverse()).filter(Boolean).forEach(w => antiOf(w).slice(0, 4).forEach(a => { if (!out.some(x => x.t === a)) out.push({ t:a, g:'наоборот к «' + w + '»' }); }));
  if (f.kind === 'def') FLIP.map(x => [r(), x]).sort((a, b) => a[0] - b[0]).slice(0, 18).forEach(([, t]) => out.push({ t, g:'' }));
  return out;
}
export function endings(line, seed = 1){
  const f = frameOf(line); return { f, wait:waiting(f), expr:expressions(f, seed), flip:flips(f, seed) };
}
// все выражения с последним словом — для рифмы
export const phraseEnds = () => phrasesAll().map(([p, g]) => ({ p, g, last:p.split(' ').pop() })).filter(x => x.p.includes(' ') && !NOISE.test(x.g));
