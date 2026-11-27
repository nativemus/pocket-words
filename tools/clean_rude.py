# Убирает грубое и матерное из данных подсказок. Запускать после любой сборки данных: python tools/clean_rude.py
import os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = re.compile(r'(^|[^а-яё])(груб|обсц|вульг|бран|презр|сексол|неприл)(?![а-яё])')
WORD = re.compile(r'(^|[^а-яё])(жоп|говн|ху[йяеёи]|пизд|бля|муд[аои]|[её]ба|[её]б[ауио]|ебл|[её]бн|въеб|выеб|заеб|наеб|отъеб|поеб|разъеб|съеб|уеб'
                  r'|сра[тнл]|сса[тнл]|дерьм|залуп|перд|сука|суки|сучар|шлюх|манд[аеуы](?![а-яё])|елд[аеуы]|трах[аену]|охуе|оху[ий])')
rude = lambda s: bool(WORD.search(s.lower().replace('^', '').replace('́', '')))

def clean(name, fn):
    p = os.path.join(R, 'data', name)
    if not os.path.exists(p): return
    L = open(p, encoding='utf-8').read().split('\n'); out = []
    for l in L:
        r = fn(l)
        if r is not None: out.append(r)
    open(p, 'w', encoding='utf-8', newline='').write('\n'.join(out))
    print(name, 'строк было', len(L), 'стало', len(out), 'правлено', sum(1 for a, b in zip(L, out) if a != b))

def pairs(sep):   # «ключ<TAB>слово<sep>слово…»: выкинуть грубый ключ и грубые слова
    def f(l):
        if '\t' not in l: return l
        k, v = l.split('\t', 1)
        if rude(k): return None
        items = [x for x in v.split(sep) if x and not rude(x)]
        return k + '\t' + sep.join(items) if items else None
    return f

clean('phrases.txt', lambda l: None if '\t' in l and (rude(l.split('\t')[0]) or TAG.search(l.split('\t')[1])) else l)
clean('next.txt', pairs(' '))
clean('assoc.txt', pairs(' '))
clean('anti.txt', pairs(' '))
clean('frames.txt', pairs('|'))
clean('rhymes.txt', lambda l: None if rude(l) else l)
