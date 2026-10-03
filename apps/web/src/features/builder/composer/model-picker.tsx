import { Input } from '@mastra/playground-ui/components/Input'
import { Check, Search } from 'lucide-react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { BuilderModel, ReasoningLevel } from '../mastra-session'
import { groupModelsByProvider, providerIcon } from './model-order'
import { humanizeModelName } from './model-display-name'
import { reasoningLabels } from './reasoning-labels'

declare module 'react' {
  interface CSSProperties {
    [property: `--cx-${string}`]: string | number | undefined
  }
}

const matches = (model: BuilderModel, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return humanizeModelName(model.modelName).toLowerCase().includes(needle) || model.providerName.toLowerCase().includes(needle)
}

/**
 * One popover, one step: search the model, pick it, and set how hard it thinks, without opening a
 * second floating layer for either.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export function ModelPicker({ models, modelId, onModelChange, disabled, levels, reasoning, onReasoningChange, reasoningDisabled }: Readonly<{
  models: readonly BuilderModel[]
  modelId: string
  onModelChange: (modelId: string) => void
  disabled: boolean
  /** The levels the selected model honors, lowest first; none when it has no reasoning level. */
  levels: readonly ReasoningLevel[]
  /** The level the selected model runs at, null when it has none. */
  reasoning: ReasoningLevel | null
  onReasoningChange: (level: ReasoningLevel) => void
  reasoningDisabled: boolean
}>) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => groupModelsByProvider(models.filter((model) => matches(model, query))), [models, query])
  const visible = useMemo(() => groups.flatMap((group) => group.models), [groups])
  const [activeId, setActiveId] = useState<string | null>(modelId || visible[0]?.id || null)
  const activeIndex = visible.findIndex((model) => model.id === activeId)

  const moveActive = (step: number) => {
    if (!visible.length) return
    const next = visible[(activeIndex + step + visible.length) % visible.length]
    if (next) { setActiveId(next.id); listRef.current?.querySelector<HTMLElement>(`[data-model-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }) }
  }
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1) }
    else if (event.key === 'Enter') { event.preventDefault(); const active = visible.find((model) => model.id === activeId); if (active) onModelChange(active.id) }
  }

  const levelIndex = reasoning ? levels.indexOf(reasoning) : -1
  const lastStop = Math.max(1, levels.length - 1)
  const onSliderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (reasoningDisabled) return
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = levels[Math.min(levels.length - 1, Math.max(0, levelIndex + step))]
    if (next && next !== reasoning) onReasoningChange(next)
  }
  // Stop centers run from one thumb radius inside the pill to one thumb radius from its far end.
  const selectLevelAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const inset = box.height / 2
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left - inset) / (box.width - 2 * inset)))
    const next = levels[Math.round(fraction * (levels.length - 1))]
    if (next && next !== reasoning) onReasoningChange(next)
  }
  // Capturing the pointer keeps a drag on the slider even when it leaves the pill.
  const onSliderPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (reasoningDisabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    selectLevelAt(event)
  }
  const onSliderPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!reasoningDisabled && event.currentTarget.hasPointerCapture(event.pointerId)) selectLevelAt(event)
  }

  return <div className="cx-model-popover">
    <p className="cx-popover-title">Modelo desta conversa</p>
    {!models.length
      ? <div className="cx-model-empty">
        <p>Nenhum modelo disponível para você.</p>
        <a href="/settings/models">Conecte uma conta de modelo</a>
      </div>
      : <>
        <div className="cx-model-search">
          <span className="cx-model-search-icon" aria-hidden="true"><Search size={15} /></span>
          <Input
            aria-label="Buscar modelo"
            placeholder="Buscar modelo"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveId(null) }}
            onKeyDown={onSearchKeyDown}
            disabled={disabled}
            autoFocus
          />
        </div>
        <div ref={listRef} className="cx-model-list" role="listbox" aria-label="Modelo desta conversa">
          {!visible.length && <p className="cx-model-empty-search">Nenhum modelo encontrado</p>}
          {groups.map((group) => !group.models.length ? null : (() => {
            const Icon = providerIcon(group.provider)
            return <div className="cx-model-group" key={group.provider}>
              <p className="cx-model-group-label">{group.providerName}</p>
              {group.models.map((model) => <button
                key={model.id}
                type="button"
                role="option"
                data-model-id={model.id}
                aria-selected={model.id === modelId}
                className="cx-model-option"
                data-active={model.id === activeId || undefined}
                disabled={disabled}
                onMouseEnter={() => setActiveId(model.id)}
                onClick={() => onModelChange(model.id)}
              >
                <Icon width={15} height={15} aria-hidden="true" />
                <span className="cx-model-option-name">{humanizeModelName(model.modelName)}</span>
                {model.id === modelId && <Check size={14} aria-hidden="true" />}
              </button>)}
            </div>
          })())}
        </div>
      </>}
    <div className="cx-effort">
      <span id="cx-effort-label" className="cx-effort-title">Raciocínio</span>
      {!reasoning
        ? <p className="cx-effort-none">Este modelo não tem nível de raciocínio para escolher.</p>
        : <>
          <b className="cx-effort-value" aria-hidden="true">{reasoningLabels[reasoning]}</b>
          <div
            className="cx-effort-slider"
            role="slider"
            tabIndex={reasoningDisabled ? -1 : 0}
            aria-labelledby="cx-effort-label"
            aria-valuemin={0}
            aria-valuemax={levels.length - 1}
            aria-valuenow={levelIndex}
            aria-valuetext={reasoningLabels[reasoning]}
            aria-disabled={reasoningDisabled || undefined}
            style={{ '--cx-effort-at': levelIndex / lastStop }}
            onKeyDown={onSliderKeyDown}
            onPointerDown={onSliderPointerDown}
            onPointerMove={onSliderPointerMove}
          >
            <span className="cx-effort-fill" aria-hidden="true" />
            {levels.map((level, index) => <span
              key={level}
              className="cx-effort-dot"
              aria-hidden="true"
              data-filled={index < levelIndex || undefined}
              style={{ '--cx-effort-stop': index / lastStop }}
            />)}
            <span className="cx-effort-thumb" aria-hidden="true" />
          </div>
        </>}
    </div>
  </div>
}
