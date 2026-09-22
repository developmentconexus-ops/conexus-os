import { useCodemirrorTheme } from '@mastra/playground-ui/components/CodeEditor'
import { LanguageDescription, type LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useState } from 'react'

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
