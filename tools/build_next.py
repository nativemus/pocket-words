# Что слушатель ждёт дальше: частые продолжения и ассоциации из разговорной речи (субтитры).
# python tools/build_next.py <ru-extract.jsonl.gz> <OpenSubtitles ru.txt.gz> [строк]
# Источники: OPUS OpenSubtitles v2018 (opus.nlpl.eu), Викисловарь (CC BY-SA 4.0).
# Пишет: data/next.txt   — «основа+слово<TAB>продолжения» ; data/assoc.txt — «слово<TAB>ассоциации»
#        data/frames.txt — «э|слово<TAB>…» (что это) и «к|слово<TAB>…» (как что) ; data/anti.txt — антонимы
import gzip, json, os, re, sys, collections, time
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKT, SUBS = sys.argv[1], sys.argv[2]
MAXL = int(sys.argv[3]) if len(sys.argv) > 3 else 14_000_000
norm = lambda w: w.replace('́', '').replace('̀', '').lower().replace('ё', 'е')
senses = {}
for l in open(os.path.join(ROOT, 'data', 'senses.txt'), encoding='utf-8'):
    w = l.split('\t')[0]; senses[norm(w)] = w
POS = {'noun': 0, 'verb': 1, 'adj': 2, 'adv': 3}
lem, pos, anti = {}, {}, {}
posset = collections.defaultdict(set)
for line in gzip.open(WIKT, 'rt', encoding='utf-8'):
    if '"ru"' not in line[:400] and '"lang_code": "ru"' not in line: continue
    e = json.loads(line)
    if e.get('lang_code') != 'ru': continue
    w = norm(e['word'])
    if w not in senses: continue
    p = POS.get(e.get('pos'), 9)
    if p == 9: continue
    pos[w] = min(pos.get(w, 9), p); posset[w].add(p)
    for f in [w] + [norm(x.get('form', '')) for x in e.get('forms') or []]:
        if not re.fullmatch(r'[а-я-]+', f): continue
        if f not in lem or f == w or (lem[f] != f and p < pos.get(lem[f], 9)): lem[f] = w
    for x in e.get('antonyms') or []:
        a = norm(x.get('word', ''))
        if re.fullmatch(r'[а-я-]{3,}', a): anti.setdefault(w, []).append(a)
print('форм', len(lem), 'антонимы у', len(anti), flush=True)
STOP = set('''и в во не на что как я ты мы вы он она оно они это этот эта эти тот та те то за по с со из к ко у о об от до под над при про без для же бы б а но да нет ну вот там тут так уже еще
мой моя мое мои твой твоя твое твои свой своя свое свои наш наша наше наши ваш ваша ваше ваши его ее их себя меня тебя нас вас мне тебе им ей ему нам вам ним ней них мной тобой собой всё все весь вся всех всем
если когда где кто чем чего чему или только был была было были будет быть есть буду будем будете будут будешь может можно надо нужно очень просто тоже потом теперь сейчас здесь ли ни раз него нее нем какой какая какие каких такой такая такие такое
сам сама само сами один одна одно одни какие-то что-то кто-то как-то что-нибудь кто-нибудь почему зачем потому поэтому конечно хорошо ладно сэр мистер мисс миссис мэм мсье ага эй ой ох ах эм хм угу окей алло привет пока пожалуйста спасибо извини извините прости простите джон джек майкл'''.split())
tokre = re.compile(r'[а-яё]+(?:-[а-яё]+)*')

# словарь форм
V = {}; names = []
cnt = collections.Counter(); t0 = time.time()
with gzip.open(SUBS, 'rt', encoding='utf-8', errors='ignore') as f:
    for n, line in enumerate(f):
        if n >= 3_000_000: break
        cnt.update(tokre.findall(line.lower().replace('ё', 'е')))
names = [w for w, _ in cnt.most_common(45000)]
V = {w: i + 1 for i, w in enumerate(names)}
NV = len(names) + 2
LEMS = sorted({lem[w] for w in names if w in lem and w not in STOP and len(w) > 2})
LI = {w: i + 1 for i, w in enumerate(LEMS)}; NL = len(LEMS) + 2
f2l = np.zeros(NV, dtype=np.int32)
for w, i in V.items():
    if w in lem and w not in STOP and len(w) > 2: f2l[i] = LI[lem[w]]
content = np.zeros(NV, dtype=bool)
for w, i in V.items(): content[i] = (w in lem and w not in STOP and len(w) > 2)
print('слов', len(names), 'лемм', len(LEMS), round(time.time() - t0), 'с', flush=True)


class Agg:
    def __init__(s, prune): s.parts = []; s.k = np.empty(0, np.int64); s.c = np.empty(0, np.int64); s.prune = prune; s.n = 0
    def add(s, a):
        k, c = np.unique(a, return_counts=True); s.parts.append((k, c)); s.n += len(k)
        if s.n > 25_000_000: s.merge()
    def merge(s, final=0):
        ks = np.concatenate([s.k] + [p[0] for p in s.parts]); cs = np.concatenate([s.c] + [p[1] for p in s.parts]); s.parts = []; s.n = 0
        o = np.argsort(ks, kind='stable'); ks = ks[o]; cs = cs[o]
        idx = np.flatnonzero(np.r_[True, ks[1:] != ks[:-1]]); s.c = np.add.reduceat(cs, idx); s.k = ks[idx]
        m = s.c >= max(s.prune, final); s.k = s.k[m]; s.c = s.c[m]


tri, bi, co = Agg(2), Agg(2), Agg(2)
eto, kak = collections.Counter(), collections.Counter()
buf = []; seen = 0; last = None
END = re.compile(r'[.!?…]')


def flush():
    global buf
    if not buf: return
    a = np.array(buf, dtype=np.int64); buf = []
    # 0 — граница реплики
    w1, w2, w3 = a[:-2], a[1:-1], a[2:]
    ok = (w2 > 0) & (w3 > 0) & content[w3]
    bi.add((w2 * NV + w3)[ok])
    l1 = f2l[w1]; ok2 = ok & (l1 > 0)
    tri.add(((l1.astype(np.int64) * NV + w2) * NV + w3)[ok2])
    L = f2l[a].astype(np.int64); z = a == 0
    blk = np.cumsum(z)
    for d in (1, 2, 3, 4):
        x, y = L[:-d], L[d:]; m = (x > 0) & (y > 0) & (x != y) & (blk[:-d] == blk[d:])
        co.add(np.concatenate([(x * NL + y)[m], (y * NL + x)[m]]))


with gzip.open(SUBS, 'rt', encoding='utf-8', errors='ignore') as f:
    for n, line in enumerate(f):
        if n >= MAXL: break
        line = line.strip().lower().replace('ё', 'е')
        if line == last: continue
        last = line
        for sent in END.split(line):
            t = tokre.findall(sent)
            if len(t) < 2: continue
            buf.extend(V.get(w, 0) for w in t); buf.append(0)
            if 'это' in t:
                i = t.index('это')
                if 1 <= i and 1 <= len(t) - i - 1 <= 3:
                    for w in reversed(t[max(0, i - 2):i]):
                        l = lem.get(w)
                        if l and 0 in posset[l] and w not in STOP and len(w) > 2:
                            eto[(l, ' '.join(t[i + 1:]))] += 1; break
            if 'как' in t:
                i = t.index('как')
                if 1 <= i and 1 <= len(t) - i - 1 <= 2:
                    w = t[i - 1]; l = lem.get(w); y = t[i + 1:]
                    if l and posset[l] & {1, 2, 3} and w not in STOP and lem.get(y[-1]) and 0 in posset[lem[y[-1]]] and not posset[lem[y[-1]]] & {1, 3} and not any(x in STOP for x in y): kak[(l, ' '.join(y))] += 1
        if len(buf) > 3_000_000: flush()
        if n % 2_000_000 == 0: print(n, round(time.time() - t0), 'с', flush=True)
flush(); tri.merge(4); bi.merge(10); co.merge(6)
print('тройки', len(tri.k), 'пары', len(bi.k), 'соседи', len(co.k), flush=True)
out = os.path.join(ROOT, 'data')
disp = lambda w: w


def top(keys, counts, base, K, mintot):
    ctx = keys // base; nxt = keys % base
    uc, inv = np.unique(ctx, return_inverse=True); tc = np.bincount(inv, weights=counts); tn = np.bincount(nxt, weights=counts, minlength=base)
    pmi = np.log(counts * counts.sum() / (tc[inv] * tn[nxt])); score = np.log1p(counts) * np.maximum(pmi, 0) * (counts >= 5)
    keep = score > 4.0; ctx, nxt, counts, score = ctx[keep], nxt[keep], counts[keep], score[keep]
    o = np.lexsort((-score, ctx)); ctx, nxt, cs = ctx[o], nxt[o], counts[o]
    st = np.flatnonzero(np.r_[True, ctx[1:] != ctx[:-1]]); en = np.r_[st[1:], len(ctx)]
    for a, b in zip(st, en):
        if cs[a:b].sum() < mintot: continue
        yield int(ctx[a]), [(int(x), int(c)) for x, c in zip(nxt[a:a + K], cs[a:a + K]) if a <= b][:min(K, b - a)]


rows = []
for c, ns in top(bi.k, bi.c, NV, 10, 25): rows.append('|' + names[c - 1] + '\t' + ' '.join(names[x - 1] for x, _ in ns))
nb = len(rows)
for c, ns in top(tri.k, tri.c, NV, 8, 16):
    l, w2 = c // NV, c % NV
    if len(ns) < 2: continue
    rows.append(LEMS[l - 1] + '|' + names[w2 - 1] + '\t' + ' '.join(names[x - 1] for x, _ in ns))
open(os.path.join(out, 'next.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(rows))
print('next', nb, len(rows), os.path.getsize(os.path.join(out, 'next.txt')) // 1024, 'КБ', flush=True)

# ассоциации: PMI с поправкой
tot = np.bincount(co.k // NL, weights=co.c, minlength=NL) + 1; S = tot.sum()
x = co.k // NL; y = co.k % NL
pm = np.log(co.c * S / (tot[x] * tot[y])) * np.minimum(1.0, np.log1p(co.c) / 4.2)
pm[(co.c < 8)] -= 1.0
isn = np.zeros(NL); 
for w, i in LI.items(): isn[i] = 1 if 0 in posset[w] and not posset[w] & {1, 2} else 0
pm = pm + isn[y] * .6
m = pm > 1.2; x, y, pm = x[m], y[m], pm[m]
o = np.lexsort((-pm, x)); x, y, pm = x[o], y[o], pm[o]
st = np.flatnonzero(np.r_[True, x[1:] != x[:-1]]); en = np.r_[st[1:], len(x)]
rows = []
for a, b in zip(st, en): rows.append(senses.get(LEMS[x[a] - 1], LEMS[x[a] - 1]) + '\t' + ' '.join(senses.get(LEMS[q - 1], LEMS[q - 1]) for q in y[a:min(b, a + 14)]))
open(os.path.join(out, 'assoc.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(rows))
print('assoc', len(rows), os.path.getsize(os.path.join(out, 'assoc.txt')) // 1024, 'КБ', flush=True)

def good(y):
    t = y.split()
    if any(w in STOP or w not in lem for w in t) or len(t) > 2: return False
    if len(t) == 1: l = lem[t[0]]; return (0 in posset[l] and (t[0] == l) and not posset[l] & {3}) or (1 in posset[l] and t[0] == l)
    a, b = t; la, lb = lem[a], lem[b]
    return (2 in posset[la] and 0 in posset[lb] and not 1 in posset[la]) or (1 in posset[la] and a == la and 0 in posset[lb])
def good_kak(y):
    t = y.split(); return all(w in lem and w not in STOP for w in t) and 0 in posset[lem[t[-1]]] and not posset[lem[t[-1]]] & {1, 3} and (len(t) == 1 or 2 in posset[lem[t[0]]])
fr = collections.defaultdict(list)
for (l, y), c in eto.items():
    if c >= 2 and good(y): fr['э|' + l].append((c, y))
for (l, y), c in kak.items():
    if c >= 2 and good_kak(y): fr['к|' + l].append((c, y))
rows = [k + '\t' + '|'.join(y for _, y in sorted(v, key=lambda z: -z[0])[:12]) for k, v in sorted(fr.items())]
# самое частое «это …» и «как …» вообще
for tag, cn in (('э', eto), ('к', kak)):
    g = collections.Counter()
    for (l, y), c in cn.items():
        if (good if tag == 'э' else good_kak)(y): g[y] += 1
    rows.append(tag + '|*\t' + '|'.join(y for y, c in g.most_common(160) if not all(w in STOP for w in y.split())))
open(os.path.join(out, 'frames.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(rows))
rows = [senses[w] + '\t' + ' '.join(dict.fromkeys(senses.get(a, a) for a in v)) for w, v in sorted(anti.items())]
open(os.path.join(out, 'anti.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(rows))
print('frames', os.path.getsize(os.path.join(out, 'frames.txt')) // 1024, 'КБ; anti', len(rows), os.path.getsize(os.path.join(out, 'anti.txt')) // 1024, 'КБ', round(time.time() - t0), 'с')
