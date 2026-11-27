# Толкования обычных слов и устойчивые выражения — из русского Викисловаря (CC BY-SA 4.0), выгрузка kaikki.org.
# python -I tools/build_senses.py <ru-extract.jsonl.gz>
# Пишет: data/senses.txt  — «слово<TAB>толкование|толкование»
#        data/forms.txt   — «форма<TAB>слово» (только формы, которые есть в наших рифмах)
#        data/phrases.txt — «выражение<TAB>толкование<TAB>опорные слова»
import gzip, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
norm = lambda w: w.replace('́', '').replace('̀', '').lower()
noyo = lambda w: w.replace('ё', 'е')
need = {}
for l in open(os.path.join(ROOT, 'data', 'rhymes.txt'), encoding='utf-8'):
    w = l.strip().replace('^', '')
    if w: need[noyo(w)] = w
d = json.load(open(os.path.join(ROOT, 'data', 'dict.json'), encoding='utf-8'))
for c in d['cards']:
    for w in re.findall(r'[а-яё-]+', norm(c['word'])):
        need.setdefault(noyo(w), w)

POS = {'noun': 0, 'verb': 1, 'adj': 2, 'adv': 3, 'intj': 4, 'pron': 5, 'num': 5, 'particle': 6, 'conj': 7, 'prep': 7, 'name': 8}
BAD = re.compile(r'^(устар|истор|церк|стар\.|арх|диал|рег\.|обл\.|спец\.|хим\.|мат\.|матем|биол|ботан|зоол|анат|геол|минер|физ\.|лингв|грам|юр\.|топоним|фамилия|женское имя|мужское имя|русская фамилия|название|форма |род\.|действие по)', re.I)
DROP = re.compile(r'(то же,? что|↑|совершить действие|вариант написания|сокр\. от|аббревиатура|см\.)', re.I)


def clean(g):
    g = re.sub(r'\s+', ' ', g).strip().strip('.;').replace('|', '/').replace('\t', ' ')
    g = re.sub(r'\[\d+\]', '', g).replace('кого-либо', 'кого-то').replace('что-либо', 'что-то').replace('чего-либо', 'чего-то').replace('чему-либо', 'чему-то').replace('чем-либо', 'чем-то').replace('кому-либо', 'кому-то').replace('куда-либо', 'куда-то').replace('какое-либо', 'какое-то')
    if len(g) > 100:
        cut = re.split(r'[;(]', g[:118])[0].strip(' ,')
        g = cut if 18 < len(cut) <= 110 else g[:97].rsplit(' ', 1)[0] + '…'
    return g


senses, forms, phr = {}, {}, {}
derived = {}
for line in gzip.open(SRC, 'rt', encoding='utf-8'):
    if '"lang_code": "ru"' not in line and '"lang_code":"ru"' not in line: continue
    e = json.loads(line)
    if e.get('lang_code') != 'ru': continue
    w = norm(e['word']); gl = []
    for s in e.get('senses') or []:
        for g in (s.get('glosses') or [])[-1:]:
            gl.append((g, s))
    if ' ' in w:
        if 2 <= len(w.split()) <= 5 and len(w) <= 34 and re.fullmatch(r'[а-яё \-]+', w):
            for g, s in gl:
                if BAD.match(g) or DROP.search(g): continue
                phr.setdefault(w, clean(g)); break
        continue
    if not re.fullmatch(r'[а-яё-]+', w): continue
    fs = {noyo(norm(f.get('form', ''))) for f in e.get('forms') or []} | {noyo(w)}
    hit = [f for f in fs if f in need]
    if not hit: continue
    pr = POS.get(e.get('pos'), 9)
    if pr == 9 or pr == 8: continue
    keep = []
    for g, s in gl:
        if not g or len(g) < 4 or BAD.match(g) or DROP.search(g): continue
        g2 = clean(g)
        if g2 and g2 not in keep: keep.append(g2)
    if keep:
        cur = senses.setdefault(w, [])
        for g in keep:
            if g not in cur and len(cur) < 6: cur.append(g)
    for f in hit:
        if f == noyo(w): continue
        forms.setdefault(f, []).append((pr, w))
    for k in ('derived', 'expressions', 'proverbs'):
        for x in e.get(k) or []:
            p = norm(x.get('word', ''))
            if ' ' in p and len(p) <= 30 and re.fullmatch(r'[а-яё \-]+', p): derived.setdefault(w, []).append(p)

out = os.path.join(ROOT, 'data')
open(os.path.join(out, 'senses.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(w + '\t' + '|'.join(g) for w, g in sorted(senses.items())))
fl = []
for f, ls in sorted(forms.items()):
    ls = [w for _, w in sorted(ls) if w in senses]
    seen = []
    for w in ls:
        if w not in seen: seen.append(w)
    if seen: fl.append(need[f] + '\t' + ','.join(seen[:2]))
open(os.path.join(out, 'forms.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(fl))
# выражение → опорные слова (леммы), к которым его показываем
heads = {}
for w, ps in derived.items():
    if w in senses:
        for p in ps: heads.setdefault(p, set()).add(w)
f2l = {noyo(need[f]): [w for _, w in sorted(ls)][0] for f, ls in forms.items()}
STOP = set('в во на с со из за по к ко у о об от до под над при без для и не ни как а но же бы что то'.split())
# грубое и матерное в выражения не берём
RUDE_TAG = re.compile(r'(^|[^а-яё])(груб|обсц|вульг|бран|презр|сексол|неприл)(?![а-яё])')
RUDE_WORD = re.compile(r'(^|[^а-яё])(жоп|говн|ху[йяеёи]|пизд|бля|муд[аои]|[её]ба|[её]б[ауио]|ебл|[её]бн|въеб|выеб|заеб|наеб|отъеб|поеб|разъеб|съеб|уеб|сра[тнл]|сса[тнл]|дерьм|залуп|перд|сука|сучар|шлюх|манд[аеуы](?![а-яё])|елд[аеуы])')
rude = lambda p, g: bool(RUDE_TAG.search(g) or RUDE_WORD.search(p))
rows = []
for p in sorted(set(heads) | set(phr)):
    hs = set(heads.get(p, set()))
    if p in phr:
        for t in p.split():
            if t in STOP: continue
            l = t if t in senses else f2l.get(noyo(t))
            if l and l in senses: hs.add(l)
    if not hs: continue
    if p not in phr: continue   # без толкования не берём
    if rude(p, phr[p]): continue
    rows.append(p + '\t' + phr[p] + '\t' + ','.join(sorted(hs)[:4]))
open(os.path.join(out, 'phrases.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(rows))
for n in ('senses.txt', 'forms.txt', 'phrases.txt'):
    p = os.path.join(out, n); print(n, sum(1 for _ in open(p, encoding='utf-8')), 'строк', os.path.getsize(p) // 1024, 'КБ')
two = sum(1 for g in senses.values() if len(g) > 1)
print('слов с 2+ смыслами', two)
for w in ('поза', 'набить', 'рукав', 'мороз', 'масть', 'угроза', 'доза', 'кадр', 'бит'): print(w, senses.get(w), [r.split('\t')[0] for r in rows if w in r.split('\t')[2].split(',')][:8])
