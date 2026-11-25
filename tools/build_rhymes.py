# Сборка данных для рифм.
# python -I tools/build_rhymes.py <all_accents.zip> <ru_50k.txt>
# Источники: ударения — Koziev/NLP_Datasets (CC0); частотность — hermitdave/FrequencyWords (CC BY-SA 4.0).
# Пишет: data/rhymes.txt (слова по частоте, ^ перед ударной гласной) и data/dict-stress.json (ударение последнего
# слова каждой карточки общего словаря). Ручные ударения — private/stress-overrides.json (в репозиторий не идёт).
import io, json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP, FREQ = sys.argv[1], sys.argv[2]
V = 'аеёиоуыэюя'

def stressed(s):
    """Вернуть слово с ^ перед ударной гласной или None."""
    s = s.strip().lower()
    if '^' in s:
        i = s.rfind('^'); return s[:i].replace('^', '') + '^' + s[i + 1:]
    if 'ё' in s:
        i = s.rfind('ё'); return s[:i] + '^' + s[i:]
    vs = [i for i, c in enumerate(s) if c in V]
    if len(vs) == 1: return s[:vs[0]] + '^' + s[vs[0]:]
    return None

acc = {}
z = zipfile.ZipFile(ZIP)
with z.open(z.namelist()[0]) as f:
    for line in io.TextIOWrapper(f, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) != 2: continue
        w = p[0].lower()
        st = stressed(p[1])
        if st and w not in acc: acc[w] = st
        we = w.replace('ё', 'е')
        if st and we not in acc: acc[we] = st

over = json.load(open(os.path.join(ROOT, 'private', 'stress-overrides.json'), encoding='utf-8'))
over = {k.strip(): v for k, v in over.items() if k != '_'}

out, seen = [], set()
for line in open(FREQ, encoding='utf-8'):
    w = line.split(' ')[0].strip().lower()
    if not re.fullmatch(r'[а-яё-]+', w) or w in seen or len(w) < 2: continue
    st = acc.get(w) or acc.get(w.replace('ё', 'е')) or stressed(w)
    if not st: continue
    seen.add(w); out.append(st)
open(os.path.join(ROOT, 'data', 'rhymes.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(out))

d = json.load(open(os.path.join(ROOT, 'data', 'dict.json'), encoding='utf-8'))
ds, miss = {}, 0
for c in d['cards']:
    src = re.split(r'\s*[/,;]\s*', c.get('say') or c['word'])[0]
    toks = re.findall(r"[A-Za-zА-Яа-яЁё́'-]+", src)
    if not toks: continue
    tok = toks[-1]
    if '́' in tok:
        i = tok.index('́'); w = (tok[:i - 1] + '^' + tok[i - 1:]).replace('́', '').lower()
        ds[c['id']] = w; continue
    lw = tok.lower()
    st = over.get(lw) or acc.get(lw) or acc.get(lw.replace('ё', 'е'))
    if not st and '-' in lw:
        last = lw.split('-')[-1]; st = acc.get(last) or acc.get(last.replace('ё', 'е'))
    if not st and re.fullmatch(r'[а-яё-]+', lw): st = stressed(lw)
    if st and re.search('[а-яё]', st): ds[c['id']] = st.replace('-', '')
    else: miss += 1
json.dump(ds, open(os.path.join(ROOT, 'data', 'dict-stress.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('слов для рифм:', len(out), '| карточек с ударением:', len(ds), '| без ударения:', miss,
      '| размер rhymes.txt:', os.path.getsize(os.path.join(ROOT, 'data', 'rhymes.txt')) // 1024, 'КБ')
