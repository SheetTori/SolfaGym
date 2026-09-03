import { readFileSync } from 'node:fs'
import { parseAbc, renderAbcSource } from '../src/core/abc'
import { analyzeSolfa } from '../src/core/abc'
import { songSchema } from '../src/core/schema'
import { spellTonic } from '../src/core/transpose'

/** 曲データの ABC と、そこから作られる2種類の譜面を確かめるための道具 */
const song = songSchema.parse(JSON.parse(readFileSync(process.argv[2], 'utf8')))
const parsed = parseAbc(song.abc)
const key = { tonic: spellTonic(song.tonicMidi, song.mode), mode: song.mode }
const { syllables } = analyzeSolfa(parsed, key)

console.log('=== 保存されている ABC ===')
console.log(song.abc)
console.log('=== リズム譜 ===')
console.log(
  renderAbcSource(parsed, {
    variant: 'rhythm',
    originalKey: key,
    targetKey: key,
    syllables,
  }),
)
