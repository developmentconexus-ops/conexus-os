/**
 * The compiler template an application is built on. A build uses `CURRENT_TEMPLATE_PIN`, and
 * migration 0042's payload admission accepts only it. The recipe hash is the one
 * `scripts/builder-e2b-template.mjs --check` prints for the files in `apps/hub/compiler-template`.
 */
export type ApplicationProfile = 'REACT_VITE_V2'

export const CURRENT_TEMPLATE_PIN: Readonly<{ profile: ApplicationProfile; templateRef: string; recipeSha256: string }> = Object.freeze({
  profile: 'REACT_VITE_V2',
  templateRef: '537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81',
  recipeSha256: 'ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5',
})
