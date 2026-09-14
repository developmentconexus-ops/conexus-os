import type { ReactNode } from 'react'

const keyFor = (prefix: string, value: string, seen: Map<string, number>): string => {
  const occurrence = seen.get(value) ?? 0
  seen.set(value, occurrence + 1)
  return `${prefix}-${value}-${occurrence}`
}

const inlineMarkdown = (text: string, keyPrefix: string): ReactNode[] => {
  const seen = new Map<string, number>()
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part) => {
    const key = keyFor(keyPrefix, part, seen)
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
    return <span key={key}>{part}</span>
  })
}

export function BuilderMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/).filter(Boolean)
  const blockKeys = new Map<string, number>()
  return <div className="builder-markdown">
    {blocks.map((block) => {
      const blockKey = keyFor('block', block, blockKeys)
      const lines = block.split('\n')
      if (lines.every((line) => /^\s*[-*] /.test(line))) {
        const lineKeys = new Map<string, number>()
        return <ul key={blockKey}>{lines.map((line) => {
          const lineKey = keyFor('item', line, lineKeys)
          return <li key={lineKey}>{inlineMarkdown(line.replace(/^\s*[-*] /, ''), lineKey)}</li>
        })}</ul>
      }
      const lineKeys = new Map<string, number>()
      let firstLine = true
      return <p key={blockKey}>{lines.map((line) => {
        const lineKey = keyFor('line', line, lineKeys)
        const prefix = firstLine ? null : <br />
        firstLine = false
        return <span key={lineKey}>{prefix}{inlineMarkdown(line, lineKey)}</span>
      })}</p>
    })}
  </div>
}
