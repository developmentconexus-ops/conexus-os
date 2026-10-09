/**
 * The compiler template an application is built on. A build uses `CURRENT_TEMPLATE_PIN`, and
 * the Registry's seal admits only it. The recipe hash is the one
 * `scripts/builder-e2b-template.mjs --check` prints for the files in `apps/hub/compiler-template`.
 */
export type ApplicationProfile = 'REACT_VITE_V2'

export const CURRENT_TEMPLATE_PIN: Readonly<{ profile: ApplicationProfile; templateRef: string; recipeSha256: string }> = Object.freeze({
  profile: 'REACT_VITE_V2',
  templateRef: '537fnzf4c16x9d7oz21k:419afad1-5af3-405c-9a52-3f6dc81dee5c',
  recipeSha256: 'aba3957596f114f821e290dd89416aba2fa1785fc34cb5162a899de759e84ffc',
})
