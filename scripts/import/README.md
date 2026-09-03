# 楽曲の取り込み

外部コーパスから単旋律を取り込み、`public/songs/*.json` を作る一度きりの工程。
アプリの実行にも通常のビルドにも関係しない（`npm ci` / `npm run build` は Python を要求しない）。

中間 JSON（`data/import/`）は 100 MB を超える派生物なのでコミットしない。
必要ならこの手順で再生成できる。

## 準備

```bash
cd scripts/import
uv sync          # music21 (BSD-3) と python-ly を入れる
```

## Mutopia Project

LilyPond ソース。曲ごとにライセンスが明示されている。

```bash
git clone --depth 1 https://github.com/MutopiaProject/MutopiaProject.git <どこか>
# Windows では MAX_PATH に当たるので長いパスを有効にする
git -C <どこか> config core.longpaths true
git -C <どこか> restore --source=HEAD :/

uv run python survey_mutopia.py <どこか>/ftp     # → mutopia_candidates.tsv
uv run python run_mutopia.py                     # → ../../data/import/*.json
```

`Public Domain` と `Creative Commons Attribution` のみを採り、**ShareAlike は除外**する
（改変物への継承義務があるため）。

**music21 は LilyPond を読めない**（書き出し専用）ので、`ly musicxml`（python-ly）を挟む。

## PDMX

MuseScore の投稿から公有部分を集めたもの。CC BY 4.0。
配布形式は MusicXML ではなく MuSPy を拡張した独自 JSON だが、
**`pitch_str` に音名が入っている**ので綴りを復元できる。

```bash
# 1. ライセンス判定用の CSV（新しい Zenodo 版。subset:no_license_conflict 列を持つ）
curl -L -o PDMX.csv "https://zenodo.org/api/records/14648209/files/PDMX.csv/content"

# 2. 楽譜本体。Zenodo は範囲リクエストに対応せず再開できないので、
#    再開できるミラーから取る（本家と同一。SHA256 で照合する）
curl -L -C - -o PDMX.tar.gz \
  "https://huggingface.co/datasets/openmusic/pdmx/resolve/main/PDMX.tar.gz"
sha256sum PDMX.tar.gz
# 19b2b4761c52b4c6059d7e3a3d25067196765c3b28c16e644c75ec8f0cb6a175

# 3. 候補を絞る
uv run python pdmx_candidates.py PDMX.csv pdmx_candidates.tsv

# 4. 候補だけをアーカイブから取り出す。
#    ミラーは旧版でパスの分け方が違うので、ハッシュから導出する
python - <<'EOF'
from pathlib import Path
rows = Path('pdmx_candidates.tsv').read_text(encoding='utf-8').splitlines()
paths = [f'PDMX/data/{h[2]}/{h[3]}/{h}.json'
         for h in (Path(l.split('\t')[0]).stem for l in rows) if len(h) >= 4]
# newline='' は必須。Windows の既定だと \r が入り tar がファイル名の一部として扱う
with open('filelist.txt', 'w', encoding='utf-8', newline='') as f:
    f.write('\n'.join(paths) + '\n')
EOF
mkdir -p x && tar -xzf PDMX.tar.gz -C x -T filelist.txt

# 5. 取り込む
uv run python run_pdmx.py x
```

### なぜ作曲者が伝承のものだけを採るのか

PDMX の「CC0 / Public Domain Mark」は**投稿者の自己申告**である。
実測すると、絞り込み後の高評価曲の作曲者に Billie Eilish・Lewis Capaldi・
Toby Fox・Koji Kondo・Bobby McFerrin が並び、**現代の著作権が生きている曲が
CC0 と申告されている**。作曲者名で裏を取れるものだけを対象にする。

## 曲データへの変換

```bash
cd ../..
npm run import:convert    # data/import/*.json → public/songs/*.json
npm run build:songs       # → public/songs/index.json
npm run test              # 全曲を検証
```

`convert-import.ts` が自動検証ゲート（`src/core/validate.ts`）を掛け、
**落ちた理由をすべて `data/import-report.md` に言語化する**。
数千曲を全数目視するのは現実的でないので、人が見るのはこのレポートと抜き取りだけ。

重複は**階名列＋音価列を指紋にして**排除する。階名はキーに依存しないので、
別の調で投稿された同じ曲も同一と判定できる。

## MIDI を使わない理由

MIDI のノート番号は 0〜127 の整数のみで、`C#4` も `D♭4` も `61`。
本アプリの階名算出は音名の綴りに依存しており（`Do#→Di` と `Re♭→Ra` は別の階名）、
この情報が MIDI には物理的に無い。綴り推定の最高精度は ps13 の 99.33%／音符だが、
50 音符のフレーズが全問正解する確率は約 71.5%——**3 曲に 1 曲が誤りを含む**。
しかも誤りは非ダイアトニック音に集中する。階名唱の教材としては使えない。

## 小節線と拍子の食い違い

PDMX の楽譜は 14% が「拍子記号と小節の中身が合わない」状態にある。
`check_meter.py` で実測できる。

```
python scripts/import/check_meter.py <PDMX を展開した先>
```

食い違いには 2 種類ある。

- **音価の桁が違う**（例: `M:2/2` なのに全部の小節が 4 分音符 1 つ分）。
  単位長が `L:1/32` になって譜面が読めない。**引き直しても救えないので弾く**
- **小節線の位置だけ崩れている**（例: 3/4 の 1 小節が 2.0 + 1.0 に割れている）。
  こちらは `rebar()`（`src/core/abcSource.ts`）が拍子どおりに引き直す。
  繰り返し記号は音楽的な意味を持つので位置を動かさない
