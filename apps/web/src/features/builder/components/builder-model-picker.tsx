import './builder-model-picker.css'
import { Combobox } from '@mastra/playground-ui/components/Combobox'
import { useRef } from 'react'
import type { BuilderModelOffer } from '../api'

const credentialCopy = (kind: BuilderModelOffer['credentialKind']): string =>
  kind === 'OAUTH_TOKEN_SET' ? 'entrada pela conta' : 'chave de API'

export function BuilderModelPicker({ offers, value, onChange, disabled }: Readonly<{
  offers: readonly BuilderModelOffer[]
  value: string | null
  onChange: (choiceId: string) => void
  disabled: boolean
}>) {
  // base-ui portals the popup; anchoring it here keeps it inside the stylesheet scope that
  // neutralises the app's global button and input rules.
  const portalRef = useRef<HTMLDivElement>(null)
  return <div className="builder-model-picker">
    <small>Modelo para o próximo pedido</small>
    <Combobox
      aria-label="Modelo para o próximo pedido"
      options={offers.map((offer) => ({
        value: offer.choiceId,
        label: offer.label,
        description: `${offer.connectionLabel} · ${credentialCopy(offer.credentialKind)}`,
      }))}
      value={value ?? ''}
      onValueChange={onChange}
      disabled={disabled}
      variant="outline"
      align="start"
      placeholder="Escolha um modelo"
      searchPlaceholder="Buscar modelo…"
      emptyText="Nenhum modelo corresponde à busca."
      container={portalRef}
    />
    <div className="builder-model-picker-portal" ref={portalRef} />
  </div>
}
