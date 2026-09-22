import { Combobox } from '@mastra/playground-ui/components/Combobox'
import {
  Composer, ComposerActions, ComposerBox, ComposerInput, ComposerRing, ComposerSuggestions, type ComposerCommand, useComposerCommands,
} from '@mastra/playground-ui/components/Composer'
import { Popover, PopoverContent, PopoverTrigger } from '@mastra/playground-ui/components/Popover'
import { Slider } from '@mastra/playground-ui/components/Slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip'
import { ArrowUp, ChevronDown, Crosshair, Mic, Plus, Square } from 'lucide-react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { type BuilderModel, type ReasoningLevel, reasoningLevels } from '../mastra-session'
import { useDictation } from './use-dictation'

export type ComposerMode =
  | Readonly<{ kind: 'READY' }>
  | Readonly<{ kind: 'NO_MODEL' }>
  | Readonly<{ kind: 'RUNNING'; stopping: boolean }>
  | Readonly<{ kind: 'BUSY_ELSEWHERE' }>
  | Readonly<{ kind: 'SENDING' }>
  | Readonly<{ kind: 'BLOCKED' }>

const commands: readonly ComposerCommand[] = [
  { name: 'nova', description: 'Abrir uma conversa nova neste Project' },
  { name: 'raciocinio', description: 'Mudar o nível de raciocínio', options: reasoningLevels.map((level) => ({ value: level, label: level })) },
]

const modelName = (model: BuilderModel | undefined): string => model?.modelName ?? 'Escolha um modelo'

// Not built yet, and said so: focusable for its tooltip, inert to clicks, never a fake action.
function Soon({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return <Tooltip>
    <TooltipTrigger render={<button type="button" className="cx-icon-button" aria-disabled="true" aria-label={label} />}>{children}</TooltipTrigger>
    <TooltipContent>{label} chega em breve</TooltipContent>
  </Tooltip>
}

export function ConstruirComposer({
  draft, onDraftChange, onSend, onStop, onNewConversation, mode, working, models, modelsPending, modelId, onModelChange, reasoning, onReasoningChange,
}: Readonly<{
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  onNewConversation: () => void
  mode: ComposerMode
  working: boolean
  models: readonly BuilderModel[]
  modelsPending: boolean
  modelId: string
  onModelChange: (modelId: string) => void
  reasoning: ReasoningLevel | null
  onReasoningChange: (level: ReasoningLevel) => void
}>) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [interim, setInterim] = useState('')
  const [pulse, setPulse] = useState(0)
  const dictation = useDictation(
    (text) => onDraftChange(draft.trim() ? `${draft.trimEnd()} ${text}` : text),
    setInterim,
  )
  const runCommand = (text: string): boolean => {
    const [name, argument] = text.trim().slice(1).split(/\s+/)
    if (!text.startsWith('/')) return false
    if (name === 'nova') onNewConversation()
    else if (name === 'raciocinio') {
      const level = reasoningLevels.find((candidate) => candidate === argument)
      if (!level) return false
      onReasoningChange(level)
    } else return false
    onDraftChange('')
    return true
  }
  const submit = (text: string) => {
    if (runCommand(text)) return
    if (mode.kind !== 'READY' || !text.trim()) return
    setPulse((value) => value + 1)
    onSend(text.trim())
  }
  const slash = useComposerCommands({ commands, value: draft, onValueChange: onDraftChange, onSubmit: submit, inputRef })
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit(draft)
  }
  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode.kind === 'RUNNING') onStop()
    else submit(draft)
  }
  const selected = models.find((model) => model.id === modelId)
  const level = reasoning ?? 'medium'
  const levelIndex = reasoningLevels.indexOf(level)
  const placeholder = {
    NO_MODEL: 'Escolha um modelo para começar',
    BUSY_ELSEWHERE: 'Outra conversa está construindo este Projeto',
    BLOCKED: 'O repositório está inacessível',
  }[mode.kind as string] ?? 'Peça uma mudança ou descreva o app…'

  return <Composer className="cx-composer" onSubmit={onFormSubmit} aria-label="Enviar pedido ao agente">
    <ComposerRing busy={working}>
      <ComposerBox sendingPulseKey={pulse}>
        <ComposerSuggestions {...slash.suggestionsProps} />
        <ComposerInput
          ref={inputRef}
          {...slash.inputProps}
          value={interim ? `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}${interim}` : draft}
          aria-label="Mensagem para o agente"
          placeholder={placeholder}
          rows={2}
          maxHeight="40vh"
          onKeyDown={onKeyDown}
        />
        <ComposerActions className="cx-composer-actions">
          <div className="cx-composer-tools">
            <Soon label="Anexar arquivo"><Plus size={18} aria-hidden="true" /></Soon>
            <Soon label="Escolher um elemento na prévia"><Crosshair size={17} aria-hidden="true" /></Soon>
          </div>
          <div className="cx-composer-tools">
            <Popover>
              <PopoverTrigger render={<button type="button" className="cx-model-button" aria-label={`Modelo ${modelName(selected)}, raciocínio ${level}`} />}>
                {selected && <i className="cx-level-dot" aria-hidden="true" />}
                <span className="cx-model-name">{modelName(selected)}</span>
                {selected && <span className="cx-model-level">{level}</span>}
                <ChevronDown size={14} aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent className="cx-model-popover" side="top" align="end" sideOffset={8}>
                <p className="cx-popover-title">Modelo desta conversa</p>
                {!modelsPending && models.length === 0
                  ? <div className="cx-model-empty">
                    <p>Nenhum modelo disponível para você.</p>
                    <a href="/settings/models">Conecte uma conta de modelo</a>
                  </div>
                  : <Combobox
                    aria-label="Modelo desta conversa"
                    options={models.map((model) => ({ value: model.id, label: model.modelName, description: model.provider }))}
                    value={selected ? modelId : ''}
                    onValueChange={onModelChange}
                    placeholder="Escolha um modelo"
                    searchPlaceholder="Buscar modelo"
                    emptyText="Nenhum modelo encontrado"
                    disabled={modelsPending || mode.kind === 'RUNNING'}
                    className="cx-model-combobox"
                  />}
                <div className="cx-effort">
                  <div className="cx-effort-head"><span id="cx-effort-label">Raciocínio</span><b>{level}</b></div>
                  <Slider
                    className="cx-effort-slider"
                    aria-labelledby="cx-effort-label"
                    min={0}
                    max={reasoningLevels.length - 1}
                    step={1}
                    value={[levelIndex]}
                    disabled={!selected || mode.kind === 'RUNNING'}
                    onValueChange={([index]) => {
                      const next = reasoningLevels[index ?? 0]
                      if (next && next !== level) onReasoningChange(next)
                    }}
                  />
                  <div className="cx-effort-stops" aria-hidden="true">{reasoningLevels.map((stop) => <span key={stop} data-on={stop === level || undefined}>{stop}</span>)}</div>
                </div>
              </PopoverContent>
            </Popover>
            {dictation.supported && <button
              type="button"
              className="cx-icon-button"
              aria-label={dictation.listening ? 'Parar o ditado' : 'Ditar por voz'}
              aria-pressed={dictation.listening}
              data-listening={dictation.listening || undefined}
              onClick={() => { dictation.toggle(); inputRef.current?.focus() }}
            ><Mic size={17} aria-hidden="true" /></button>}
            <SendButton mode={mode} empty={!draft.trim()} />
          </div>
        </ComposerActions>
      </ComposerBox>
    </ComposerRing>
    {dictation.error && <p className="cx-composer-note" role="alert">{dictation.error}</p>}
    <p className="cx-composer-hint">Enter envia · Shift+Enter quebra linha · / para comandos</p>
    <p className="cx-composer-hint">O agente executa comandos sozinho num ambiente isolado com acesso à internet.</p>
  </Composer>
}

function SendButton({ mode, empty }: Readonly<{ mode: ComposerMode; empty: boolean }>) {
  if (mode.kind === 'RUNNING') {
    return <button type="submit" className="cx-send-button" data-stop aria-label={mode.stopping ? 'Parando' : 'Parar'} disabled={mode.stopping}>
      <Square size={13} fill="currentColor" aria-hidden="true" />
    </button>
  }
  return <button type="submit" className="cx-send-button" aria-label={mode.kind === 'SENDING' ? 'Enviando' : 'Enviar'} disabled={mode.kind !== 'READY' || empty}>
    <ArrowUp size={17} aria-hidden="true" />
  </button>
}
