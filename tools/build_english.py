# Сборка английского произношения для рифм.
# python -I tools/build_english.py <cmudict.dict> <en_50k.txt>
# Источники: CMU Pronouncing Dictionary (BSD, github.com/cmusphinx/cmudict); частотность — hermitdave/FrequencyWords (CC BY-SA 4.0).
# Пишет: data/english.txt — строки «слово<TAB>как звучит», ^ перед ударной гласной, по частоте.
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CMU, FREQ = sys.argv[1], sys.argv[2]
LIMIT = 30000

CONS = {'B': 'б', 'CH': 'ч', 'D': 'д', 'DH': 'з', 'F': 'ф', 'G': 'г', 'HH': 'х', 'JH': 'дж', 'K': 'к', 'L': 'л', 'M': 'м',
        'N': 'н', 'NG': 'нг', 'P': 'п', 'R': 'р', 'S': 'с', 'SH': 'ш', 'T': 'т', 'TH': 'с', 'V': 'в', 'Z': 'з', 'ZH': 'ж'}
VOW = {'AA': 'а', 'AE': 'э', 'AH': 'а', 'AO': 'о', 'AW': 'ау', 'AY': 'ай', 'EH': 'е', 'ER': 'ер', 'EY': 'ей', 'IH': 'и',
       'IY': 'и', 'OW': 'оу', 'OY': 'ой', 'UH': 'у', 'UW': 'у'}
IOT = {'у': 'ю', 'а': 'я', 'е': 'е', 'э': 'е', 'о': 'ё', 'ё': 'ё', 'и': 'и'}


def sound(word, ph):
    out, n = '', len(ph)
    vows = [p for p in ph if p[-1].isdigit()]
    if not vows: return None
    prim = next((i for i, p in enumerate(ph) if p.endswith('1')), None)
    if prim is None: prim = next(i for i, p in enumerate(ph) if p[-1].isdigit())
    # буква «о» в написании: hot, shot, top у нас звучат через «о»; a — father, car — через «а»
    letters_o = 'o' in word
    iot = False
    for i, p in enumerate(ph):
        if p[-1].isdigit():
            v, st = p[:-1], i == prim
            r = VOW[v]
            if v == 'AA' and letters_o and not ('a' in word and word.find('a') < word.find('o')): r = 'о'
            if v == 'ER': r = 'ёр' if st else 'ер'
            if v == 'AH' and not st:
                # hustle → хасл, rhythm → ритм: глухой звук перед сонорным на конце выпадает
                if i == n - 2 and ph[i + 1] in ('L', 'M') and i > 0 and not ph[i - 1][-1].isdigit(): r = ''
                else: r = 'е' if i == n - 2 and ph[i + 1] == 'N' else 'а'
            if r and not out or (r and out and out[-1] in 'аеёиоуыэюя^'):
                if r[0] == 'е': r = 'э' + r[1:]
            if iot and r:
                if out and out[-1] not in 'аеёиоуыэюяй': out += 'ь'
                r = IOT.get(r[0], 'й' + r[0]) + r[1:]
            elif iot: out += 'й'
            iot = False
            out += ('^' if st else '') + r
        elif p == 'Y':
            iot = True
        elif p == 'W':
            out += 'у' if not out else 'в'
        else:
            c = CONS[p]
            if p == 'Z' and i == n - 1 and out and out[-1] not in 'аеёиоуыэюяй': c = 'с'
            out += c
    if iot: out += 'й'
    out = out.replace('нгг', 'нг').replace('нгк', 'нк')
    return out if '^' in out and re.search(r'\^[аеёиоуыэюя]', out) else None


pron = {}
for line in open(CMU, encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line: continue
    w, *ph = line.split()
    if '(' in w or not re.fullmatch(r"[a-z][a-z'-]*", w): continue
    pron.setdefault(w, ph)

rows, seen = [], set()
# сленг и вещи, которых нет в CMU, — вручную
extra = {}
for line in open(os.path.join(ROOT, 'tools', 'english-extra.txt'), encoding='utf-8'):
    p = line.strip().split()
    if len(p) == 2: extra[p[0]] = p[1]
for line in open(FREQ, encoding='utf-8'):
    w = line.split(' ')[0].strip().lower().replace('’', "'")
    if w in seen or w in extra or w not in pron: continue
    if len(w) == 1 and w not in 'ai': continue
    s = sound(w, pron[w])
    if not s: continue
    seen.add(w); rows.append(w + '\t' + s)
    if len(rows) >= LIMIT: break
rows[3000:3000] = [w + '\t' + s for w, s in extra.items()]  # сленг — в частую часть, чтобы предлагался как рифма
path = os.path.join(ROOT, 'data', 'english.txt')
open(path, 'w', encoding='utf-8', newline='').write('\n'.join(rows))
print('английских слов:', len(rows), '| размер:', os.path.getsize(path) // 1024, 'КБ')
d = dict(r.split('\t') for r in rows)
for w in sys.argv[3:]: print(' ', w, d.get(w))
