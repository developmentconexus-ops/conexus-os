import './composer.css'
import {
  Composer, ComposerActions, ComposerBox, ComposerInput, ComposerRing, ComposerSuggestions, type ComposerCommand, useComposerCommands,
} from '@mastra/playground-ui/components/Composer'
import { Popover, PopoverContent, PopoverTrigger } from '@mastra/playground-ui/components/Popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip'
import { ArrowUp, ChevronDown, Mic, Paperclip, Square } from 'lucide-react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { type BuilderModel, type ReasoningLevel, reasoningLevels } from '../mastra-session'
import { useDictation } from './use-dictation'
import { ModelPicker } from './model-picker'
import { providerIcon } from './model-order'
import { reasoningLabels } from './reasoning-labels'

export type ComposerMode =
  | Readonly<{ kind: 'READY' }>
  | Readonly<{ kind: 'NO_MODEL' }>
  | Readonly<{ kind: 'RUNNING'; stopping: boolean }>
  | Readonly<{ kind: 'BUSY_ELSEWHERE' }>
  | Readonly<{ kind: 'SENDING' }>
  | Readonly<{ kind: 'BLOCKED' }>

const commands: readonly ComposerCommand[] = [
  { name: 'nova', description: 'Abrir uma conversa nova neste Project' },
  { name: 'raciocinio', description: 'Mudar o nível de raciocínio', options: reasoningLevels.map((level) => ({ value: level, label: reasoningLabels[level] })) },
]

const modelName = (model: BuilderModel | undefined): string => model?.modelName ?? 'Escolha um modelo'

// Not built yet, and said so: focusable for its tooltip, inert to clicks, never a fake action.
function Soon({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return <Tooltip>
    <TooltipTrigger render={<button type="button" className="cx-icon-button" aria-disabled="true" aria-label={label} />}>{children}</TooltipTrigger>
    <TooltipContent>{label} chega em breve</TooltipContent>
  </Tooltip>
}

/**
 * The chat composer shared by the home prompt and Construir: describe the app or the next change,
 * pick the model and how hard it should think, dictate by voice, send. Identical component, so the
 * two surfaces never drift into two different boxes with the same job.
 */
export function BuilderComposer({
  draft, onDraftChange, onSend, onStop, onNewConversation, mode, working, models, modelsPending, modelId, onModelChange, reasoning, onReasoningChange,
  placeholder = 'O que vamos construir ou melhorar?',
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
  placeholder?: string
}>) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [interim, setInterim] = useState('')
  const [pulse, setPulse] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
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
  const placeholderByMode: Readonly<Record<string, string>> = {
    NO_MODEL: 'Escolha um modelo para começar',
    BUSY_ELSEWHERE: 'Outra conversa está construindo este Projeto',
    BLOCKED: 'O repositório está inacessível',
  }
  const activePlaceholder = placeholderByMode[mode.kind] ?? placeholder

  return <Composer className="cx-composer" onSubmit={onFormSubmit} aria-label="Enviar pedido ao agente">
    <ComposerRing busy={working}>
      <ComposerBox sendingPulseKey={pulse}>
        <ComposerSuggestions {...slash.suggestionsProps} />
        <ComposerInput
          ref={inputRef}
          {...slash.inputProps}
          value={interim ? `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}${interim}` : draft}
          aria-label="Mensagem para o agente"
          placeholder={activePlaceholder}
          rows={2}
          maxHeight="40vh"
          onKeyDown={onKeyDown}
        />
        <ComposerActions className="cx-composer-actions">
          <div className="cx-composer-tools">
            <Soon label="Anexar arquivo"><Paperclip size={17} aria-hidden="true" /></Soon>
          </div>
          <div className="cx-composer-tools">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger render={<button type="button" className="cx-model-button" aria-label={`Modelo ${modelName(selected)}, raciocínio ${reasoningLabels[level]}`} />}>
                {selected && (() => { const Icon = providerIcon(selected.provider); return <Icon width={14} height={14} aria-hidden="true" /> })()}
                <span className="cx-model-name">{modelName(selected)}</span>
                {selected && <span className="cx-model-level">· {reasoningLabels[level]}</span>}
                <ChevronDown size={14} aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent side="top" align="end" sideOffset={8}>
                <ModelPicker
                  models={models}
                  modelId={selected ? modelId : ''}
                  onModelChange={(next) => { onModelChange(next); setPickerOpen(false) }}
                  disabled={modelsPending || mode.kind === 'RUNNING'}
                  reasoning={level}
                  onReasoningChange={onReasoningChange}
                  reasoningDisabled={!selected || mode.kind === 'RUNNING'}
                />
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
    <p className="cx-composer-hint">Enter envia · Shift+Enter quebra linha · / comandos</p>
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
