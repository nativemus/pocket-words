# card-turns*.src.txt → data/turns-cards.txt (слово с ^ · другие написания · карточка · смыслы). Проверяет карточки и повторы.
import json, os, re, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cards = {c['word'] for c in json.load(open(os.path.join(R, 'data/dict.json'), encoding='utf-8'))['cards']}
old = {l.split('\t')[0].replace('́', '').lower().replace('ё', 'е') for l in open(os.path.join(R, 'data/turns.txt'), encoding='utf-8') if '\t' in l}
out, seen, bad = [], {}, 0
import glob
for n, l in [(os.path.basename(f) + ':' + str(i), l) for f in sorted(glob.glob(os.path.join(R, 'tools/card-turns*.src.txt'))) for i, l in enumerate(open(f, encoding='utf-8'), 1)]:
    l = l.strip()
    if not l or l.startswith('#'): continue
    p = [x.strip() for x in l.split(';;')]
    if len(p) != 4: print('строка', n, 'колонок', len(p)); bad += 1; continue
    w, al, card, s = p; s = [x.strip() for x in s.split('|') if x.strip()]
    plain = w.replace('^', '').lower(); key = plain.replace('ё', 'е')
    if card and card not in cards: print('строка', n, 'нет карточки:', card); bad += 1
    if len(s) < 2: print('строка', n, plain, 'смыслов', len(s)); bad += 1
    if len(set(s)) != len(s): print('строка', n, plain, 'повтор смысла'); bad += 1
    for x in s:
        if len(x) > 44: print('строка', n, 'длинно:', x)
    if key in old: print('строка', n, plain, '— уже есть в turns.txt, смыслы сольются')
    if key in seen: print('строка', n, plain, 'повтор строки', seen[key]); bad += 1
    seen[key] = n
    al = [a for a in (x.strip().lower() for x in al.split(',')) if a and a != plain]
    out.append('\t'.join([w if re.search('[а-я]', plain) else plain, ','.join(al), card, '|'.join(s)]))
keys = {}
for x in out:
    w, al = x.split('	')[:2]; keys[w.replace('^', '').lower().replace('ё', 'е')] = w
used = {}
for x in out:
    w, al = x.split('	')[:2]
    for a in filter(None, al.split(',')):
        k = a.replace('ё', 'е')
        if k in old: print(w, ': написание', a, 'уже слово в turns.txt')
        if k in keys and keys[k] != w or k in used and used[k] != w: print(w, ': написание', a, 'занято', keys.get(k) or used.get(k))
        used[k] = w
if bad: sys.exit('ошибок: %d' % bad)
open(os.path.join(R, 'data/turns-cards.txt'), 'w', encoding='utf-8', newline='').write('\n'.join(out) + '\n')
print('слов', len(out), 'с карточкой', sum(1 for x in out if x.split('\t')[2]), 'смыслов', sum(len(x.split('\t')[3].split('|')) for x in out))
