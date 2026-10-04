import './composer.css'
import {
  Composer, ComposerActions, ComposerBox, ComposerInput, ComposerRing, ComposerSuggestions, type ComposerCommand, useComposerCommands,
} from '@mastra/playground-ui/components/Composer'
import { Popover, PopoverContent, PopoverTrigger } from '@mastra/playground-ui/components/Popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip'
import { ArrowUp, ChevronDown, Mic, Paperclip, Square } from 'lucide-react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { type BuilderModel, type ReasoningLevel, levelForModel } from '../mastra-session'
import type { MemoryGauge, MemoryOperation } from '../runtime'
import { MemoryStatus } from './memory-status'
import { useDictation } from './use-dictation'
import { ModelPicker } from './model-picker'
import { providerIcon } from './model-order'
import { parseThinkCommand } from '@mastra/code-sdk/thinking'
import { humanizeModelName } from './model-display-name'
import { reasoningLabels } from './reasoning-labels'

export type ComposerMode =
  | Readonly<{ kind: 'READY' }>
  | Readonly<{ kind: 'NO_MODEL' }>
  | Readonly<{ kind: 'LOADING_MODEL' }>
  | Readonly<{ kind: 'MODEL_ERROR'; message: string }>
  | Readonly<{ kind: 'RUNNING'; stopping: boolean }>
  | Readonly<{ kind: 'WAITING'; stopping: boolean; sending: boolean }>
  | Readonly<{ kind: 'BUSY_ELSEWHERE' }>
  | Readonly<{ kind: 'SENDING' }>
  | Readonly<{ kind: 'BLOCKED' }>

// `/raciocinio` offers exactly the levels the selected model honors, the ones the slider shows, and
// none for a model with no reasoning level.
const commandsFor = (levels: readonly ReasoningLevel[]): readonly ComposerCommand[] => [
  { name: 'nova', description: 'Abrir uma conversa nova neste Project' },
  ...levels.length ? [{ name: 'raciocinio', description: 'Mudar o nível de raciocínio', options: levels.map((level) => ({ value: level, label: reasoningLabels[level] })) }] : [],
]

const modelName = (model: BuilderModel | undefined): string => model ? humanizeModelName(model.modelName) : 'Escolha um modelo'

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
  memory = null, memoryFailed = null, placeholder = 'O que vamos construir ou melhorar?', onRetryModels,
}: Readonly<{
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  onStop?: () => void
  onNewConversation: () => void
  mode: ComposerMode
  working: boolean
  models: readonly BuilderModel[]
  modelsPending: boolean
  modelId: string
  onModelChange: (modelId: string) => void
  reasoning: ReasoningLevel | null
  onReasoningChange: (level: ReasoningLevel) => void
  // The conversation's observational memory; absent before a conversation exists.
  memory?: MemoryGauge | null
  // What the memory last failed at, until it succeeds at it again.
  memoryFailed?: MemoryOperation | null
  placeholder?: string
  onRetryModels?: () => void
}>) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [interim, setInterim] = useState('')
  const [pulse, setPulse] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  // The Hub refuses a model change while a turn is active, so the control waits for it to end.
  const modelLocked = working || mode.kind === 'SENDING' || mode.kind === 'WAITING'
  const dictation = useDictation(
    (text) => onDraftChange(draft.trim() ? `${draft.trimEnd()} ${text}` : text),
    setInterim,
  )
  const selected = models.find((model) => model.id === modelId)
  const levels = selected?.thinkingLevels ?? []
  const runCommand = (text: string): boolean => {
    const [name, ...argument] = text.trim().slice(1).split(/\s+/)
    if (!text.startsWith('/')) return false
    if (name === 'nova') onNewConversation()
    else if (name === 'raciocinio') {
      const command = parseThinkCommand(argument.join(' '), levels)
      if (command.kind !== 'set') return false
      onReasoningChange(command.level)
    } else return false
    onDraftChange('')
    return true
  }
  const submit = (text: string) => {
    if (runCommand(text)) return
    if (!(mode.kind === 'READY' || (mode.kind === 'WAITING' && !mode.sending)) || !text.trim()) return
    setPulse((value) => value + 1)
    onSend(text.trim())
  }
  const slash = useComposerCommands({ commands: commandsFor(levels), value: draft, onValueChange: onDraftChange, onSubmit: submit, inputRef })
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit(draft)
  }
  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode.kind === 'RUNNING') onStop?.()
    else submit(draft)
  }
  const level = reasoning ? levelForModel(levels, reasoning) : null
  const placeholderByMode: Readonly<Record<string, string>> = {
    NO_MODEL: 'Escolha um modelo para começar',
    LOADING_MODEL: 'Carregando modelos…',
    MODEL_ERROR: 'Não foi possível carregar os modelos',
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
              <PopoverTrigger render={<button type="button" className="cx-model-button" aria-label={`Modelo ${modelName(selected)}${level ? `, raciocínio ${reasoningLabels[level]}` : ''}`} />}>
                {selected && (() => { const Icon = providerIcon(selected.provider); return <Icon width={14} height={14} aria-hidden="true" /> })()}
                <span className="cx-model-name">{modelName(selected)}</span>
                {selected && level && <span className="cx-model-level">· {reasoningLabels[level]}</span>}
                <ChevronDown size={14} aria-hidden="true" />
              </PopoverTrigger>
              {/* p-0 matches PopoverContent's own padding-utility check, so it skips its default px-3
                  py-3.5 and lets .cx-model-popover-content own the padding instead. */}
              <PopoverContent side="top" align="end" sideOffset={8} className="cx-model-popover-content p-0">
                <ModelPicker
                  models={models}
                  modelId={selected ? modelId : ''}
                  onModelChange={(next) => { onModelChange(next); setPickerOpen(false) }}
                  disabled={modelsPending || modelLocked}
                  levels={levels}
                  reasoning={level}
                  onReasoningChange={onReasoningChange}
                  reasoningDisabled={!selected || modelLocked}
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
            {mode.kind === 'WAITING' && <StopButton stopping={mode.stopping} onStop={onStop} />}
            <SendButton mode={mode} empty={!draft.trim()} />
          </div>
        </ComposerActions>
      </ComposerBox>
    </ComposerRing>
    {mode.kind === 'MODEL_ERROR' && (
      <div className="cx-composer-note" role="alert">
        <span>Não foi possível carregar os modelos. {mode.message}</span>
        {onRetryModels && (
          <button type="button" className="cx-composer-retry" onClick={onRetryModels}>
            Tentar novamente
          </button>
        )}
      </div>
    )}
    {dictation.error && <p className="cx-composer-note" role="alert">{dictation.error}</p>}
    <div className="cx-composer-foot">
      {memory && <MemoryStatus memory={memory} failed={memoryFailed} />}
      <p className="cx-composer-hint">Enter envia · / comandos</p>
    </div>
  </Composer>
}

// While the run waits on the person, Send continues it with the message and Stop is its own control.
function StopButton({ stopping, onStop }: Readonly<{ stopping: boolean; onStop: (() => void) | undefined }>) {
  return <button type="button" className="cx-send-button" data-stop aria-label={stopping ? 'Parando' : 'Parar'} disabled={stopping} onClick={onStop}>
    <Square size={13} fill="currentColor" aria-hidden="true" />
  </button>
}

function SendButton({ mode, empty }: Readonly<{ mode: ComposerMode; empty: boolean }>) {
  if (mode.kind === 'RUNNING') {
    return <button type="submit" className="cx-send-button" data-stop aria-label={mode.stopping ? 'Parando' : 'Parar'} disabled={mode.stopping}>
      <Square size={13} fill="currentColor" aria-hidden="true" />
    </button>
  }
  const sending = mode.kind === 'SENDING' || (mode.kind === 'WAITING' && mode.sending)
  const open = mode.kind === 'READY' || (mode.kind === 'WAITING' && !mode.sending)
  return <button type="submit" className="cx-send-button" aria-label={sending ? 'Enviando' : 'Enviar'} disabled={!open || empty}>
    <ArrowUp size={17} aria-hidden="true" />
  </button>
}
