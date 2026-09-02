import { readFileSync } from 'node:fs'
import { parseAbc } from '../src/core/abc'
import { emitAbc, importedKey, importedSongSchema, trimTrailingSilence } from '../src/core/abcSource'
import { buildPlaybackPlan } from '../src/core/playback'

/** 取り込んだコード記号が、実際に鳴る拍まで正しく届くかを目で確かめるための道具 */
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const imported = importedSongSchema.parse(raw)
const song = { ...imported, elements: trimTrailingSilence(imported.elements) }

const abc = emitAbc(song)
console.log(abc)

const parsed = parseAbc(abc)
const key = importedKey(song)
const plan = buildPlaybackPlan({
  song: parsed,
  originalKey: key,
  targetKey: key,
  mode: song.mode,
  chords: song.chords,
})

console.log(`カウントイン ${plan.countInBeats} 拍 / 1小節 ${plan.beatsPerBar} 拍`)
console.log('コード記号:', song.chords.map((c) => `${c.degree}@bar${c.bar}`).join(' '))
console.log('鳴る和音:')
for (const c of plan.accompaniment) {
  console.log(`  拍 ${c.startBeat} 長さ ${c.durationBeats} → MIDI ${c.midis.join(',')}`)
}
console.log('旋律の開始拍:', plan.melody.map((n) => n.startBeat).join(', '))
