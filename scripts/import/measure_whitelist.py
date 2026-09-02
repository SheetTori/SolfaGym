"""PD が確実な作曲者に限ると何曲残るか。

PDMX の「CC0/PD Mark」は投稿者の自己申告なので、作曲者名で
裏を取れるものだけを数える。表記ゆれが激しいので部分一致で拾う。
"""
import csv, sys, collections, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
csv.field_size_limit(10**8)

# 没後 95 年以上（1930年以前に没）。米国の発行後95年も自動的に満たす
PD_COMPOSERS = [
    'bach', 'mozart', 'beethoven', 'haydn', 'schubert', 'chopin', 'schumann',
    'mendelssohn', 'brahms', 'tchaikovsky', 'dvorak', 'dvořák', 'grieg', 'liszt',
    'handel', 'händel', 'vivaldi', 'scarlatti', 'telemann', 'purcell', 'couperin',
    'rameau', 'clementi', 'czerny', 'burgm', 'duvernoy', 'kuhlau', 'diabelli',
    'carulli', 'sor,', 'fernando sor', 'giuliani', 'tárrega', 'tarrega', 'legnani',
    'aguado', 'satie', 'debussy', 'faure', 'fauré', 'saint-sa', 'bizet', 'offenbach',
    'verdi', 'rossini', 'donizetti', 'bellini', 'paganini', 'schütz', 'praetorius',
    'dowland', 'byrd', 'palestrina', 'monteverdi', 'corelli', 'albinoni', 'pachelbel',
    'foster', 'sousa', 'joplin', 'gottschalk', 'field', 'hummel', 'weber',
    'cutting', 'gounod', 'franck', 'borodin', 'mussorgsky', 'rimsky',
]
TRADITIONAL = ['traditional', 'trad.', 'trad', 'anon', 'folk', 'unknown']

def truthy(v):
    return str(v).strip().lower() in ('true', '1', 'yes')

def classify(name):
    n = name.lower()
    if any(k in n for k in PD_COMPOSERS):
        return 'pd-composer'
    if any(re.search(r'\b' + re.escape(k), n) for k in TRADITIONAL):
        return 'traditional'
    return 'unknown'

counts = collections.Counter()
by_composer = collections.Counter()
samples = collections.defaultdict(list)

with open(sys.argv[1], encoding='utf-8', newline='') as f:
    for row in csv.DictReader(f):
        if not truthy(row.get('subset:no_license_conflict')):
            continue
        try:
            if int(float(row.get('n_tracks') or 0)) != 1:
                continue
            bars = float(row.get('song_length.bars') or 0)
            n_ratings = int(float(row.get('n_ratings') or 0))
            rating = float(row.get('rating') or 0)
        except ValueError:
            continue
        if truthy(row.get('is_draft')) or not (8 <= bars <= 64):
            continue

        name = (row.get('composer_name') or '').strip()
        kind = classify(name)
        rated = n_ratings >= 5 and rating >= 4.5

        counts[f'全体/{kind}'] += 1
        if rated:
            counts[f'高評価/{kind}'] += 1
            if kind != 'unknown':
                by_composer[name[:40]] += 1
                if len(samples[kind]) < 12:
                    samples[kind].append(row.get('title') or '?')

print('=== 8〜64小節・単一トラック・非下書き の集合における作曲者の内訳 ===')
for k in ['全体/pd-composer', '全体/traditional', '全体/unknown']:
    print(f'  {k:22s} {counts[k]:>8,}')
print()
for k in ['高評価/pd-composer', '高評価/traditional', '高評価/unknown']:
    print(f'  {k:22s} {counts[k]:>8,}')

print('\n=== 高評価かつ PD 作曲者/伝承 の曲名サンプル ===')
for kind in ('pd-composer', 'traditional'):
    for t in samples[kind][:10]:
        print(f'  [{kind}] {t[:60]}')
