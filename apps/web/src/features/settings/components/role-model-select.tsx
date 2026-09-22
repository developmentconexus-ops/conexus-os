import { Combobox } from '@mastra/playground-ui/components/Combobox'
import type { BuilderModel } from '../../builder/mastra-session'

export function RoleModelSelect({ label, models, value, onChange }: Readonly<{
  label: string
  models: readonly BuilderModel[]
  value: string
  onChange: (value: string) => void
}>) {
  const options = models.map((model) => ({ label: `${model.provider} · ${model.modelName}`, value: model.id }))
  return <div className="cxs-field">
    <span className="cxs-field-label">{label}</span>
    <Combobox options={options} value={value} onValueChange={onChange} placeholder="Escolha um modelo" aria-label={label} />
  </div>
}
