"""絞り込み後の集合に、どんな作曲者が並ぶかを見る。

PDMX の PD 表示は投稿者の自己申告なので、作曲者名からしか
著作権の生死は推し量れない。
"""
import csv, sys, collections, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
csv.field_size_limit(10**8)

def truthy(v):
    return str(v).strip().lower() in ('true', '1', 'yes')

composers = collections.Counter()
titles = []
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
        if not (n_ratings >= 5 and rating >= 4.5):
            continue
        c = (row.get('composer_name') or '').strip() or '(空欄)'
        composers[c] += 1
        titles.append((row.get('title') or '?', c))

print(f'対象: {sum(composers.values())} 曲 / 作曲者 {len(composers)} 人\n')
print('=== 作曲者の上位 30 ===')
for c, n in composers.most_common(30):
    print(f'  {n:4d}  {c[:60]}')

print('\n=== 曲名サンプル（無作為に 25 件） ===')
import random
random.seed(0)
for t, c in random.sample(titles, min(25, len(titles))):
    print(f'  {t[:56]:58s} | {c[:30]}')
