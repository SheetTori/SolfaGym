import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { songSchema, type SongIndex } from '../src/core/schema'
import { analyzeSong, toIndexEntry, tonicMatchesAbcKey, tonicOctaveLooksRight } from '../src/core/song'

/**
 * public/songs/*.json を読んで index.json を生成する。
 * レベルと階名は曲データから算出するので、手で index を書かない。
 */

const SONGS_DIR = join(process.cwd(), 'public', 'songs')
const INDEX_FILE = join(SONGS_DIR, 'index.json')

const files = readdirSync(SONGS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()

const entries = []
const problems: string[] = []

for (const file of files) {
  const raw = JSON.parse(readFileSync(join(SONGS_DIR, file), 'utf8'))
  const parsed = songSchema.safeParse(raw)
  if (!parsed.success) {
    problems.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`)
    continue
  }
  const song = parsed.data

  if (song.id !== file.replace(/\.json$/, '')) {
    problems.push(`${file}: id とファイル名が一致しない (id=${song.id})`)
    continue
  }
  if (!tonicMatchesAbcKey(song)) {
    problems.push(`${file}: tonicMidi と ABC の K: フィールドが食い違っている`)
    continue
  }

  try {
    const analyzed = analyzeSong(song)
    if (!tonicOctaveLooksRight(analyzed)) {
      problems.push(
        `${file}: tonicMidi=${song.tonicMidi} が旋律の音域 ${analyzed.minMidi}-${analyzed.maxMidi} から離れすぎている`,
      )
      continue
    }
    entries.push(toIndexEntry(analyzed))
  } catch (e) {
    problems.push(`${file}: ${(e as Error).message}`)
  }
}

if (problems.length > 0) {
  console.error('曲データに問題があります:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

entries.sort((a, b) => {
  // 日本の音階ユニットは本流のレベル進行とは別枠なので末尾に置く
  if (a.unit !== b.unit) return a.unit === 'kodaly' ? -1 : 1
  if (a.level !== b.level) return a.level - b.level
  return a.id.localeCompare(b.id)
})

const index: SongIndex = { generatedAt: new Date().toISOString(), songs: entries }
writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8')

console.log(`${entries.length} 曲を index.json に書き出しました`)
for (const e of entries) {
  console.log(`  Lv${e.level} ${e.unit === 'japanese' ? '[日本] ' : ''}${e.title} — ${e.syllables.join(' ')}`)
}
