const MARK_PIECES = ['M4 4H18V14H10V28H4Z', 'M28 28H14V18H22V4H28Z'] as const

type MarkMotion = 'still' | 'working' | 'fit-once'

// Decorative on purpose: the wordmark names the product and the run status names the work, so the
// mark never carries meaning a screen reader would miss.
export function ConexusMark({ size = 24, working = false, arrive = false }: Readonly<{
  size?: number
  working?: boolean
  arrive?: boolean
}>) {
  const motion: MarkMotion = working ? 'working' : arrive ? 'fit-once' : 'still'
  return <svg
    className={motion === 'still' ? 'cx-mark' : `cx-mark cx-mark--${motion}`}
    width={size}
    height={size}
    viewBox="0 0 32 32"
    data-motion={motion}
    aria-hidden="true"
  >
    <path className="cx-mark-a" d={MARK_PIECES[0]} fill="currentColor" />
    <path className="cx-mark-b" d={MARK_PIECES[1]} fill="currentColor" />
  </svg>
}

export function ConexusWordmark({ size = 'sm', markSize, working = false, arrive = false }: Readonly<{
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** The prototype draws the mark a size larger than the wordmark text. Defaults to the text size. */
  markSize?: number
  working?: boolean
  arrive?: boolean
}>) {
  const sizeInPixels = { xs: 18, sm: 20, md: 26, lg: 32 }[size]
  return <span className={`cx-wordmark cx-wordmark--${size}`} role="img" aria-label="Conexus">
    <ConexusMark size={markSize ?? sizeInPixels} working={working} arrive={arrive} />
    <span aria-hidden="true">Co<em>nexus</em></span>
  </span>
}
