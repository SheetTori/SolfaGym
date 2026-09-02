import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { emitAbc, importedSongSchema, type ImportedSong } from '../src/core/abcSource'
import { analyzeSong } from '../src/core/song'
import { validateImported, type ValidationResult } from '../src/core/validate'
import type { Song } from '../src/core/schema'

/**
 * 中間 JSON（Python が出したもの）を曲データに変換する。
 *
 * 自動検証ゲートを通し、**落ちたものは理由付きでレポートに残す**。
 * 数百曲を全数目視するのは現実的でないので、人が見るのはこのレポートと
 * 抜き取りだけになる。
 */

const IMPORT_DIR = join(process.cwd(), 'data', 'import')
const SONGS_DIR = join(process.cwd(), 'public', 'songs')
const REPORT = join(process.cwd(), 'data', 'import-report.md')

interface Row {
  id: string
  title: string
  status: 'ok' | 'rejected' | 'malformed'
  detail: string
  level?: number
  syllables?: string
  bars?: number
  flags?: string
}

/** 出典側の命名に依存せず、id を安全な形に正規化する */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'song'
  )
}

function main() {
  mkdirSync(SONGS_DIR, { recursive: true })
  const files = readdirSync(IMPORT_DIR).filter((f) => f.endsWith('.json')).sort()

  const rows: Row[] = []
  let kept = 0

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(IMPORT_DIR, file), 'utf8'))
    const parsed = importedSongSchema.safeParse(raw)
    if (!parsed.success) {
      rows.push({
        id: file.replace(/\.json$/, ''),
        title: String(raw.title ?? '?'),
        status: 'malformed',
        detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
      continue
    }

    const imported: ImportedSong = parsed.data
    let result: ValidationResult
    try {
      result = validateImported(imported)
    } catch (e) {
      rows.push({
        id: imported.id,
        title: imported.title,
        status: 'malformed',
        detail: `検証中に例外: ${(e as Error).message}`,
      })
      continue
    }

    if (!result.ok) {
      rows.push({
        id: imported.id,
        title: imported.title,
        status: 'rejected',
        detail: result.issues.map((i) => `${i.code}（${i.message}）`).join(' / '),
      })
      continue
    }

    const song: Song = {
      id: slugify(imported.id),
      title: imported.title,
      titleEn: imported.titleEn ?? undefined,
      language: imported.language ?? undefined,
      source: `${imported.provenance.source} — ${imported.provenance.license}`,
      provenance: imported.provenance,
      mode: imported.mode,
      tonicMidi: imported.tonicMidi,
      baseBpm: imported.baseBpm,
      unit: 'kodaly',
      chords: imported.chords,
      abc: emitAbc(imported),
    }

    // 曲データとして最後まで通ることを、書き出す前に確かめる
    let level: number
    let syllables: string[]
    try {
      const analyzed = analyzeSong(song)
      level = analyzed.level
      syllables = analyzed.distinctSyllables
    } catch (e) {
      rows.push({
        id: imported.id,
        title: imported.title,
        status: 'rejected',
        detail: `曲データとして読めない: ${(e as Error).message}`,
      })
      continue
    }

    writeFileSync(join(SONGS_DIR, `${song.id}.json`), JSON.stringify(song, null, 2) + '\n', 'utf8')
    kept++

    const p = imported.provenance
    const flags = [
      p.keyAgreesWithAnalysis ? null : '調が music21 と不一致',
      p.keyDecidedBy === null ? '長短の手がかりなし' : null,
    ].filter(Boolean)

    rows.push({
      id: song.id,
      title: song.title,
      status: 'ok',
      detail: '',
      level,
      syllables: syllables.join(' '),
      bars: result.stats?.bars,
      flags: flags.join(' / '),
    })
  }

  writeReport(rows, kept, files.length)
  console.log(`${files.length} 件中 ${kept} 件を public/songs/ に書き出しました`)
  console.log(`レポート: ${REPORT}`)
}

function writeReport(rows: Row[], kept: number, total: number) {
  const ok = rows.filter((r) => r.status === 'ok')
  const rejected = rows.filter((r) => r.status !== 'ok')

  // 落ちた理由を種別ごとに数える
  const reasons = new Map<string, number>()
  for (const r of rejected) {
    for (const code of r.detail.split(' / ').map((d) => d.split('（')[0])) {
      reasons.set(code, (reasons.get(code) ?? 0) + 1)
    }
  }

  const lines: string[] = [
    '# 取り込みレポート',
    '',
    `${total} 件中 **${kept} 件**が通過。`,
    '',
    '## 落ちた理由',
    '',
    '| 件数 | 理由 |',
    '|---:|---|',
    ...[...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `| ${n} | ${code} |`),
    '',
    '## 通過した曲',
    '',
    '| Lv | 曲名 | 小節 | 階名 | 要確認 |',
    '|---:|---|---:|---|---|',
    ...ok
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
      .map((r) => `| ${r.level} | ${r.title} | ${r.bars} | ${r.syllables} | ${r.flags || ''} |`),
    '',
    '## 落ちた曲',
    '',
    '| 曲名 | 理由 |',
    '|---|---|',
    ...rejected.map((r) => `| ${r.title} | ${r.detail} |`),
    '',
  ]
  writeFileSync(REPORT, lines.join('\n'), 'utf8')
}

main()
