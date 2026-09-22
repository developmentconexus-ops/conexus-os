import { useCallback, useEffect, useRef, useState } from 'react'

// The Web Speech API is not in TypeScript's DOM library, so the slice this hook uses is named here.
type RecognitionResultList = ArrayLike<ArrayLike<Readonly<{ transcript: string }>> & Readonly<{ isFinal: boolean }>>
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally?: boolean
  onresult: ((event: Readonly<{ resultIndex: number; results: RecognitionResultList }>) => void) | null
  onend: (() => void) | null
  onerror: ((event: Readonly<{ error: string }>) => void) | null
  start(): void
  stop(): void
}
type RecognitionConstructor = new () => Recognition

const recognitionConstructor = (): RecognitionConstructor | null => {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as Readonly<{ SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }>
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

export type Dictation = Readonly<{ supported: boolean; listening: boolean; error: string | null; toggle: () => void }>

/**
 * Speech to text into the composer, in pt-BR. Final phrases are appended to the draft; the phrase
 * still being heard is shown through `onInterim` and replaced when it settles.
 */
export const useDictation = (onFinal: (text: string) => void, onInterim: (text: string) => void): Dictation => {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const handlers = useRef({ onFinal, onInterim })
  handlers.current = { onFinal, onInterim }
  const Constructor = recognitionConstructor()

  useEffect(() => () => recognition.current?.stop(), [])

  const toggle = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    if (!Constructor) return
    const instance = new Constructor()
    instance.lang = 'pt-BR'
    instance.continuous = true
    instance.interimResults = true
    // Keeps the audio on the device where the browser can; elsewhere the browser's own service hears it.
    if ('processLocally' in instance) instance.processLocally = true
    instance.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const text = result?.[0]?.transcript ?? ''
        if (result?.isFinal) handlers.current.onFinal(text.trim())
        else interim += text
      }
      handlers.current.onInterim(interim.trim())
    }
    instance.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'O navegador não permitiu usar o microfone.' : 'O ditado parou. Tente de novo.')
    }
    instance.onend = () => {
      recognition.current = null
      setListening(false)
      handlers.current.onInterim('')
    }
    recognition.current = instance
    setError(null)
    setListening(true)
    instance.start()
  }, [Constructor])

  return { supported: Constructor !== null, listening, error, toggle }
}
