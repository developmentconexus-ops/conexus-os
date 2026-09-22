import { useTheme } from '@mastra/playground-ui/components/ThemeProvider'
import { Moon, Sun } from 'lucide-react'

/** Sun/moon toggle in the top bar. The component library's ThemeProvider (wired in main.tsx with
 *  `defaultTheme="system"`) already follows the operating system and remembers an explicit pick
 *  per browser; this button only reads and flips it. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  return <button type="button" className="cx-theme-toggle" onClick={() => setTheme(next)} aria-label={resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
    {resolvedTheme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
  </button>
}
