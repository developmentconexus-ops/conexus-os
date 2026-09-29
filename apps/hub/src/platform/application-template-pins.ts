/**
 * The compiler template an application is built on. A build uses `CURRENT_TEMPLATE_PIN`, migration
 * 0037's payload admission accepts only it, and every pin in `READABLE_TEMPLATE_PINS` may still be
 * read back from the registry. The recipe hash is the one `scripts/builder-e2b-template.mjs --check`
 * prints for the files in `apps/hub/compiler-template`.
 */
export type ApplicationProfile = 'REACT_VITE_V1' | 'REACT_VITE_V2'

export type TemplatePin = Readonly<{
  profile: ApplicationProfile
  templateRef: string
  recipeSha256: string
}>

export const CURRENT_TEMPLATE_PIN: TemplatePin = Object.freeze({
  profile: 'REACT_VITE_V2',
  templateRef: '537fnzf4c16x9d7oz21k:3505be5f-f9ab-4d49-837e-af56dea09755',
  recipeSha256: '41a3d125df1e6579dd7d1ccc1c2014eb68a5ad321f010d792333dc8053d3c434',
})

// Applications retained on the React-only template stay readable: the agent user template of
// migration 0014, and the boot smoke template before it (0007).
const READABLE_TEMPLATE_PINS: readonly TemplatePin[] = Object.freeze([
  CURRENT_TEMPLATE_PIN,
  Object.freeze({
    profile: 'REACT_VITE_V1',
    templateRef: '537fnzf4c16x9d7oz21k:0f44de30-d856-40d1-b6b3-54a8bbf2f440',
    recipeSha256: 'df2e896284661a4402158d6e694493332df57de4b56f4c565e5b6ed19bfabde4',
  }),
  Object.freeze({
    profile: 'REACT_VITE_V1',
    templateRef: '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189',
    recipeSha256: '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf',
  }),
])

export const isReadableTemplatePin = (pin: TemplatePin): boolean =>
  READABLE_TEMPLATE_PINS.some((known) => known.profile === pin.profile && known.templateRef === pin.templateRef && known.recipeSha256 === pin.recipeSha256)
