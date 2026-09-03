import { parseAbc, renderAbcSource } from '../src/core/abc'
import { parsePitch } from '../src/core/pitch'

/** ビームのまとまり方を目で確かめるための道具 */
const key = { tonic: parsePitch('C4'), mode: 'major' as const }

const cases: Array<[string, string]> = [
  ['4/4 の8分', 'X:1\nM:4/4\nL:1/8\nK:C\nC C D D E E F F | G2 A A B B c2 |]\n'],
  ['4/4 の16分', 'X:1\nM:4/4\nL:1/16\nK:C\nCCDD EEFF GGAA BBcc |]\n'],
  ['6/8', 'X:1\nM:6/8\nL:1/8\nK:C\nC D E F G A | c B A G F E |]\n'],
  ['休符をまたぐ', 'X:1\nM:4/4\nL:1/8\nK:C\nC C z2 D D E2 | C2 z C D D E2 |]\n'],
  ['3/4', 'X:1\nM:3/4\nL:1/8\nK:C\nC C D D E E | F2 G2 A2 |]\n'],
  ['付点8分＋16分', 'X:1\nM:4/4\nL:1/16\nK:C\nC3 D E3 F G3 A B3 c |]\n'],
  ['4分は束ねない', 'X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]\n'],
  ['タイをまたぐ', 'X:1\nM:4/4\nL:1/8\nK:C\nC C D- D E E F F |]\n'],
]

for (const [label, src] of cases) {
  const out = renderAbcSource(parseAbc(src), {
    variant: 'rhythm',
    originalKey: key,
    targetKey: key,
    syllables: null,
  })
  const body = out
    .split('\n')
    .filter((l) => l && !/^[XTMLK]:/.test(l))
    .join(' // ')
  console.log(`${label.padEnd(14)} ${body}`)
}
