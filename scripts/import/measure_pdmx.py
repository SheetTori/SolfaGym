"""フェーズ0: PDMX を絞り込んだとき実際に何曲残るかを測る。

14 GB の楽譜本体を落とす前に、CSV だけで採否を判断するためのもの。
"""
import csv, sys, collections
csv.field_size_limit(10**8)

PATH = sys.argv[1]
counts = collections.Counter()
langs = collections.Counter()
samples = []
tracks_hist = collections.Counter()

def truthy(v):
    return str(v).strip().lower() in ('true', '1', 'yes')

with open(PATH, encoding='utf-8', newline='') as f:
    r = csv.DictReader(f)
    for row in r:
        counts['total'] += 1
        no_conflict = truthy(row.get('subset:no_license_conflict'))
        if not no_conflict:
            continue
        counts['no_license_conflict'] += 1

        try:
            n_tracks = int(float(row.get('n_tracks') or 0))
        except ValueError:
            n_tracks = 0
        tracks_hist[min(n_tracks, 6)] += 1
        if n_tracks != 1:
            continue
        counts['+single_track'] += 1

        if truthy(row.get('is_draft')):
            continue
        counts['+not_draft'] += 1

        try:
            bars = float(row.get('song_length.bars') or 0)
        except ValueError:
            bars = 0
        if not (8 <= bars <= 64):
            continue
        counts['+8to64bars'] += 1

        try:
            n_ratings = int(float(row.get('n_ratings') or 0))
            rating = float(row.get('rating') or 0)
        except ValueError:
            n_ratings, rating = 0, 0.0
        counts['+rated>=1'] += 1 if n_ratings >= 1 else 0
        if n_ratings >= 5 and rating >= 4.5:
            counts['+rated>=5 & >=4.5'] += 1
            if len(samples) < 40:
                samples.append((row.get('title') or row.get('song_name') or '?',
                                row.get('composer_name') or row.get('artist_name') or '?',
                                int(bars), n_ratings, round(rating, 2)))

print('=== 絞り込みの段階ごとの残数 ===')
for k in ['total', 'no_license_conflict', '+single_track', '+not_draft',
          '+8to64bars', '+rated>=1', '+rated>=5 & >=4.5']:
    print(f'{k:24s} {counts[k]:>9,}')

print('\n=== no_license_conflict のトラック数分布 ===')
for k in sorted(tracks_hist):
    label = f'{k}' if k < 6 else '6+'
    print(f'  n_tracks={label:3s} {tracks_hist[k]:>9,}')

print('\n=== 高評価・単一トラックの曲名サンプル ===')
for t, c, b, nr, rt in samples[:30]:
    print(f'  {t[:46]:48s} {c[:22]:24s} {b:3d}小節 {nr:3d}件 {rt}')
