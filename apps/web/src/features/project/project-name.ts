const MAX_NAME_LENGTH = 40

// Words a name must not end on: a cut there reads as a sentence stopped halfway.
const TRAILING_FILLERS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'à', 'às',
  'com', 'sem', 'para', 'pra', 'por', 'pelo', 'pela', 'sobre', 'entre', 'até',
  'e', 'ou', 'mas', 'que', 'se',
])

// The suggested Project name: the description's first phrase, cut on a word boundary at about 40
// characters, never ending on an article, preposition or conjunction.
export function suggestProjectName(description: string): string {
  const firstPhrase = description.split(/[,;:.!?\n\r]/).map((part) => part.trim()).find(Boolean) ?? ''
  const words = firstPhrase.replace(/["“”()]+/g, ' ').split(/\s+/).filter(Boolean)
  const kept: string[] = []
  for (const word of words) {
    if ([...kept, word].join(' ').length > MAX_NAME_LENGTH) break
    kept.push(word)
  }
  if (kept.length === 0 && words[0]) kept.push(words[0].slice(0, MAX_NAME_LENGTH))
  while (kept.length > 1 && TRAILING_FILLERS.has((kept.at(-1) ?? '').toLocaleLowerCase('pt-BR'))) kept.pop()
  const name = kept.join(' ')
  return name ? name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1) : ''
}
