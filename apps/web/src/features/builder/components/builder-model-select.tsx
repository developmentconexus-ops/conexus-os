import { useId } from 'react'
import type { BuilderModel } from '../mastra-session'

const modelLabel = (model: BuilderModel): string => `${model.provider} · ${model.modelName}`

export function BuilderModelSelect({ models, value, onChange, disabled }: Readonly<{
  models: readonly BuilderModel[]
  value: string
  onChange: (modelId: string) => void
  disabled: boolean
}>) {
  const selectId = useId()
  return <div className="builder-model-select">
    <label htmlFor={selectId}>Modelo do Builder</label>
    <select id={selectId} value={value} disabled={disabled || models.length === 0} onChange={(event) => onChange(event.target.value)}>
      {/* Nothing is chosen on the operator's behalf, so an unselected session keeps an empty value
          the placeholder names instead of falling onto the first model. */}
      <option value="" disabled>Escolha um modelo</option>
      {models.map((model) => <option key={model.id} value={model.id}>{modelLabel(model)}</option>)}
    </select>
  </div>
}
