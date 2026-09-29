import './composer.css'
import {
  Composer, ComposerActions, ComposerBox, ComposerInput, ComposerRing, ComposerSuggestions, type ComposerCommand, useComposerCommands,
} from '@mastra/playground-ui/components/Composer'
import { DropdownMenu } from '@mastra/playground-ui/components/DropdownMenu'
import { Popover, PopoverContent, PopoverTrigger } from '@mastra/playground-ui/components/Popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip'
import { ArrowUp, ChevronDown, Hammer, Lock, Map as MapIcon, Mic, Paperclip, Square } from 'lucide-react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { type BuilderMode, type BuilderModel, type MemoryGauge, type MemoryOperation, type ReasoningLevel, reasoningLevels } from '../mastra-session'
import { builderModes } from '../live-turn'
import { MemoryStatus } from './memory-status'
import { useDictation } from './use-dictation'
import { ModelPicker } from './model-picker'
import { providerIcon } from './model-order'
import { humanizeModelName, parseReasoningSuffix } from './model-display-name'
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

type AgentMode = Readonly<{ label: string; hint: string; icon: typeof MapIcon }>
const agentModes: Readonly<Record<BuilderMode, AgentMode>> = {
  plan: { label: 'Planejar', hint: 'Lê o app e propõe um plano antes de mudar qualquer arquivo', icon: MapIcon },
  build: { label: 'Construir', hint: 'Muda o app e publica a prévia', icon: Hammer },
}
const nextMode = (mode: BuilderMode): BuilderMode => builderModes[(builderModes.indexOf(mode) + 1) % builderModes.length] ?? mode
// A conversation's mode changes only between runs (AC-5); the chip says so instead of going dead.
const MODE_LOCKED = 'O modo muda quando o Builder parar.'

/**
 * The conversation's mode as one chip: it names the current mode, opens the two with what each
 * does, and while a run works it stays readable and tells why it cannot change.
 */
function ModeChip({ mode, locked, onChange }: Readonly<{ mode: BuilderMode; locked: boolean; onChange: (mode: BuilderMode) => void }>) {
  const current = agentModes[mode]
  const Icon = current.icon
  if (locked) {
    return <Popover>
      <PopoverTrigger render={<button type="button" className="cx-mode-chip" data-mode={mode} data-locked title={`${current.label}. ${MODE_LOCKED}`} aria-label={`Modo: ${current.label}. ${MODE_LOCKED}`} />}>
        <Icon size={14} aria-hidden="true" /><span className="cx-mode-label">{current.label}</span><Lock size={12} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="cx-mode-note">{MODE_LOCKED}</PopoverContent>
    </Popover>
  }
  return <DropdownMenu>
    <DropdownMenu.Trigger className="cx-mode-chip" data-mode={mode} title={`${current.label}: ${current.hint}`} aria-label={`Modo: ${current.label}`}>
      <Icon size={14} aria-hidden="true" /><span className="cx-mode-label">{current.label}</span><ChevronDown size={13} aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content side="top" align="start" sideOffset={8} className="cx-mode-menu">
      <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => { const next = builderModes.find((option) => option === value); if (next && next !== mode) onChange(next) }}>
        {builderModes.map((option) => { const entry = agentModes[option]; return <DropdownMenu.RadioItem key={option} value={option} className="cx-mode-option" data-mode={option}>
          <entry.icon size={15} aria-hidden="true" />
          <span className="cx-mode-option-text"><span className="cx-mode-option-name">{entry.label}</span><span className="cx-mode-option-hint">{entry.hint}</span></span>
        </DropdownMenu.RadioItem> })}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu>
}

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
  agentMode, onAgentModeChange, memory = null, memoryFailed = null, placeholder = 'O que vamos construir ou melhorar?',
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
  // Planejar or Construir, the conversation's own mode; it switches only while nothing runs (AC-5).
  agentMode: BuilderMode
  onAgentModeChange: (mode: BuilderMode) => void
  // The conversation's observational memory; absent before a conversation exists.
  memory?: MemoryGauge | null
  // What the memory last failed at, until it succeeds at it again.
  memoryFailed?: MemoryOperation | null
  placeholder?: string
}>) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [interim, setInterim] = useState('')
  const [pulse, setPulse] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [modeNote, setModeNote] = useState<string | null>(null)
  const modeLocked = working || mode.kind === 'SENDING'
  const changeMode = (next: BuilderMode) => {
    setModeNote(null)
    onAgentModeChange(next)
  }
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
    // Shift+Tab cycles the mode, as in Mastra Code and Claude Code.
    if (!event.defaultPrevented && event.key === 'Tab' && event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (modeLocked) setModeNote(MODE_LOCKED)
      else changeMode(nextMode(agentMode))
      return
    }
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
  // google-ai-pro/CLIProxy models bake the reasoning level into the id itself (`-low`/`-high`); such
  // a model has no independent reasoning setting, so its own level wins over any stored choice.
  const lockedReasoning = selected ? parseReasoningSuffix(selected.modelName) : null
  const level = lockedReasoning?.level ?? reasoning ?? 'medium'
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
            <ModeChip mode={agentMode} locked={modeLocked} onChange={changeMode} />
          </div>
          <div className="cx-composer-tools">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger render={<button type="button" className="cx-model-button" aria-label={`Modelo ${modelName(selected)}, raciocínio ${reasoningLabels[level]}`} />}>
                {selected && (() => { const Icon = providerIcon(selected.provider); return <Icon width={14} height={14} aria-hidden="true" /> })()}
                <span className="cx-model-name">{modelName(selected)}</span>
                {selected && <span className="cx-model-level">· {reasoningLabels[level]}</span>}
                <ChevronDown size={14} aria-hidden="true" />
              </PopoverTrigger>
              {/* p-0 matches PopoverContent's own padding-utility check, so it skips its default px-3
                  py-3.5 and lets .cx-model-popover-content own the padding instead. */}
              <PopoverContent side="top" align="end" sideOffset={8} className="cx-model-popover-content p-0">
                <ModelPicker
                  models={models}
                  modelId={selected ? modelId : ''}
                  onModelChange={(next) => { onModelChange(next); setPickerOpen(false) }}
                  disabled={modelsPending || mode.kind === 'RUNNING'}
                  reasoning={level}
                  onReasoningChange={onReasoningChange}
                  reasoningDisabled={!selected || mode.kind === 'RUNNING' || Boolean(lockedReasoning)}
                  reasoningLocked={Boolean(lockedReasoning)}
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
    {modeNote && <p className="cx-composer-note" role="status">{modeNote}</p>}
    <div className="cx-composer-foot">
      {memory && <MemoryStatus memory={memory} failed={memoryFailed} />}
      <p className="cx-composer-hint">Enter envia · Shift+Tab muda o modo · / comandos</p>
    </div>
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
