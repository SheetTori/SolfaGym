import abcjs from 'abcjs'
import { useEffect, useRef } from 'react'

/**
 * abcjs で楽譜を描き、再生カーソルを当てる。
 *
 * カーソルの対応づけに `TimingCallbacks` は使わない。あれは繰り返しを
 * 時間方向に展開するため、譜面上の要素と1対1にならない（7要素の楽譜に
 * 対して 11 イベントが出る）。代わりに描画後の SVG を DOM 順に引く。
 * `.abcjs-note` / `.abcjs-rest` は譜面に書かれた順にちょうど1つずつ
 * 現れるので、解析結果の要素列とそのまま揃う。
 *
 * 時計は Tone.js の AudioContext ただ1つ。ここは受け取った index を
 * 表示に反映するだけで、時間を持たない。
 */

export interface AbcScoreProps {
  abc: string
  /** 発音する音符の通し番号。null で消灯 */
  cursorIndex: number | null
  /**
   * 発音する音符の通し番号 → 譜面上の要素位置（休符とタイ継続を含む通し番号）。
   * `soundingToElementIndex()` で作る。
   */
  soundingToElement: readonly number[]
  className?: string
}

/**
 * abcjs は width / height 属性を持つ viewBox 無しの SVG を吐く。
 * そのままでは CSS で拡縮できない。
 *
 * abcjs の `responsive: 'resize'` オプションは viewBox を付けてくれるが、
 * 同時に window の resize リスナーを仕掛ける。これが親要素の
 * `overflow-x: auto` と噛み合うとスクロールバーの出没で再描画が振動し、
 * レンダラごと固まる（実際に固まった）。リスナーを持たせず、描画後に
 * viewBox を自分で付けるだけにする。これなら計算が一巡して終わる。
 */
function makeScalable(host: HTMLElement): void {
  const svg = host.querySelector('svg')
  if (!svg) return
  const width = svg.getAttribute('width')
  const height = svg.getAttribute('height')
  if (!width || !height) return
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
  svg.removeAttribute('width')
  svg.removeAttribute('height')
}

export function AbcScore({ abc, cursorIndex, soundingToElement, className }: AbcScoreProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const elementsRef = useRef<Element[]>([])
  const litRef = useRef<Element | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    abcjs.renderAbc(host, abc, {
      add_classes: true,
      paddingtop: 8,
      paddingbottom: 8,
      paddingleft: 0,
      paddingright: 0,
    })
    makeScalable(host)

    elementsRef.current = Array.from(host.querySelectorAll('.abcjs-note, .abcjs-rest'))
    litRef.current = null

    return () => {
      host.innerHTML = ''
      elementsRef.current = []
      litRef.current = null
    }
  }, [abc])

  // `abc` を依存に含めるのは、再生中に階名表示を切り替えるなどして
  // 描き直されたときにカーソルを当て直すため。描き直しで要素が入れ替わり、
  // cursorIndex は変わらないので、これが無いとカーソルが消えたままになる。
  useEffect(() => {
    litRef.current?.classList.remove('playing')
    litRef.current = null
    if (cursorIndex === null) return

    const elementIndex = soundingToElement[cursorIndex]
    if (elementIndex === undefined) return
    const el = elementsRef.current[elementIndex]
    if (!el) return
    el.classList.add('playing')
    litRef.current = el
  }, [cursorIndex, soundingToElement, abc])

  return <div ref={hostRef} className={className} />
}
