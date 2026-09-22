import { useCodemirrorTheme } from '@mastra/playground-ui/components/CodeEditor'
import { LanguageDescription, type LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { diff as computeDiff, MergeView, unifiedMergeView } from '@codemirror/merge'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useRef, useState } from 'react'

// Each language pack is its own chunk, fetched the first time a file of that kind opens.
const useLanguage = (path: string): LanguageSupport | null => {
  const [support, setSupport] = useState<Readonly<{ path: string; language: LanguageSupport | null }>>({ path, language: null })
  useEffect(() => {
    let current = true
    const description = LanguageDescription.matchFilename(languages, path)
    if (!description) {
      setSupport({ path, language: null })
      return undefined
    }
    void description.load().then((language) => { if (current) setSupport({ path, language }) }, () => {})
    return () => { current = false }
  }, [path])
  return support.path === path ? support.language : null
}

const cspNonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content

const readOnly: readonly Extension[] = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  lineNumbers(),
  ...(cspNonce ? [EditorView.cspNonce.of(cspNonce)] : []),
]

export function CodeView({ path, content }: Readonly<{ path: string; content: string }>) {
  const theme = useCodemirrorTheme()
  const language = useLanguage(path)
  return <CodeMirror
    className="cx-code"
    value={content}
    theme={theme}
    basicSetup={{ lineNumbers: false, foldGutter: true, highlightActiveLine: false, highlightActiveLineGutter: false }}
    extensions={[...readOnly, ...(language ? [language] : [])]}
    aria-label={`Conteúdo de ${path}`}
  />
}

/** Added and removed line counts for one file, from the same diff engine the merge views render. */
export function lineCounts(before: string, after: string): Readonly<{ added: number; removed: number }> {
  let added = 0
  let removed = 0
  for (const change of computeDiff(before, after)) {
    if (change.toB > change.fromB) added += (after.slice(change.fromB, change.toB).match(/\n/g)?.length ?? 0) + 1
    if (change.toA > change.fromA) removed += (before.slice(change.fromA, change.toA).match(/\n/g)?.length ?? 0) + 1
  }
  return { added, removed }
}

const collapseUnchanged = { margin: 3, minSize: 6 }
const unchangedPhrase = EditorState.phrases.of({ '$ unchanged lines': '$ linhas sem alteração' })

/**
 * The new text, with what the run removed shown inline above what it wrote. The merge extension
 * reads its original once, so a caller keys this view by the file and both revisions.
 */
export function DiffView({ path, before, after }: Readonly<{ path: string; before: string; after: string }>) {
  const theme = useCodemirrorTheme()
  const language = useLanguage(path)
  return <CodeMirror
    className="cx-code"
    value={after}
    theme={theme}
    basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
    extensions={[
      ...readOnly,
      EditorView.lineWrapping,
      unifiedMergeView({ original: before, mergeControls: false, collapseUnchanged }),
      unchangedPhrase,
      ...(language ? [language] : []),
    ]}
    aria-label={`Alterações em ${path}`}
  />
}

/**
 * The same comparison as {@link DiffView}, but as two read-only panes side by side (the version
 * removed on the left, the version written on the right) instead of one inline stream.
 */
export function DiffViewSideBySide({ path, before, after }: Readonly<{ path: string; before: string; after: string }>) {
  const theme = useCodemirrorTheme()
  const language = useLanguage(path)
  const host = useRef<HTMLElement>(null)
  useEffect(() => {
    const parent = host.current
    if (!parent) return undefined
    const shared: readonly Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      lineNumbers(),
      EditorView.lineWrapping,
      theme,
      ...(cspNonce ? [EditorView.cspNonce.of(cspNonce)] : []),
      ...(language ? [language] : []),
    ]
    const view = new MergeView({
      parent,
      a: { doc: before, extensions: shared },
      b: { doc: after, extensions: shared },
      gutter: true,
      collapseUnchanged,
    })
    return () => view.destroy()
  }, [before, after, theme, language])
  return <section className="cx-code cx-code-split" ref={host} aria-label={`Alterações em ${path}, lado a lado`} />
}
