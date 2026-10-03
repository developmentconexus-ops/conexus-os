/**
 * The compiler template an application is built on. A build uses `CURRENT_TEMPLATE_PIN`, and
 * migration 0042's payload admission accepts only it. The recipe hash is the one
 * `scripts/builder-e2b-template.mjs --check` prints for the files in `apps/hub/compiler-template`.
 */
export type ApplicationProfile = 'REACT_VITE_V2'

export const CURRENT_TEMPLATE_PIN: Readonly<{ profile: ApplicationProfile; templateRef: string; recipeSha256: string }> = Object.freeze({
  profile: 'REACT_VITE_V2',
  templateRef: '537fnzf4c16x9d7oz21k:449fd9f1-3b61-4c88-9a06-fd61bbfb4060',
  recipeSha256: '4ce6f3a6b1233edb4a3f8741751239c7d43bf70c0b8e75318106ac08543ab05d',
})
