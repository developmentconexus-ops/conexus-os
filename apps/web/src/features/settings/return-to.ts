// The rail's "Voltar" item returns to wherever the person was before they opened Settings. Router
// history does not track that reliably across reloads and deep links, so this module remembers the
// last resolved location that was not itself a Settings route, fed by router.tsx's own subscription.
let lastNonSettingsPath = '/'

export const rememberReturnTo = (pathname: string): void => {
  if (pathname.startsWith('/settings')) return
  lastNonSettingsPath = pathname
}

export const returnToPath = (): string => lastNonSettingsPath
