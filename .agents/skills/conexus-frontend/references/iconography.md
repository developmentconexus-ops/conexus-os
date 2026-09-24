# Iconography

Lucide is the only icon set. Import each icon from `lucide-react`, which `apps/web` already depends on.

```tsx
import { Hammer } from 'lucide-react'

<Hammer size={16} aria-hidden="true" />
```

## Drawing

- Keep Lucide's defaults: outline, stroke 2, round caps and joins, 24 viewBox. Do not pass `strokeWidth`.
- Color comes from `currentColor`. Set the color on the parent (`--cx-text-2` idle, `--cx-text` on hover, `--cx-accent-text` on an ipê hover). Never give an icon its own hex.
- One filled exception: the stop control draws `Square` with `fill="currentColor"`.

## Sizes

| Size | Where |
| --- | --- |
| 13px | Inside a collapsed tool group row. |
| 14px | Chevrons and toolbar icons. |
| 15px | Pane switch and small inline actions. |
| 16px | Buttons and most inline icons. |
| 17px | Composer tools and the theme toggle. |
| 18px | Scope rail rows (`frame.css` forces 18px there). |

Pick from this table. Larger sizes (22–40px) appear only for the mark and empty-state emblems, and those use `ConexusMark`, not a Lucide icon.

## Accessibility

- A decorative icon next to a text label takes `aria-hidden="true"`.
- An icon-only button carries an `aria-label` in pt-BR that names the action ("Tema escuro", "Ditar por voz", "Anexar arquivo"). Add a Mastra `Tooltip` with the same words when the icon is not self-evident.
- An icon never carries status alone. Pair it with a word.

## The vocabulary in use

Use the same icon for the same meaning everywhere. Before adding a new icon, check whether one below already means it.

| Icon | Meaning |
| --- | --- |
| `Hammer` | Construir. |
| `Info` | Sobre. |
| `LayoutGrid` | Projetos. |
| `Users` | Pessoas. |
| `Settings` | Configurações. |
| `ArrowLeft` | Back to the parent scope. |
| `Plus` | Create. |
| `SquarePen` | Nova conversa. |
| `ChevronDown`, `ChevronRight`, `ChevronsUpDown` | Disclosure and switchers. |
| `File`, `FileText`, `Folder` | The Code lens file tree. |
| `ListChecks` | The agent's task list. |
| `Search`, `MoreHorizontal` | Search, more actions. |
| `ArrowUp` | Send. |
| `Square` (filled) | Stop. |
| `Mic` | Dictate. |
| `Paperclip` | Attach (em breve). |
| `Check` | Done. |
| `Monitor`, `Smartphone`, `RotateCw` | Preview toolbar: desktop, phone, reload. |
| `AppWindow`, `MessageSquare` | Pane switch: App, Conversa. |
| `KeyRound`, `User`, `ShieldCheck` | Model accounts, the person, administrators. |
| `Code2`, `SlidersHorizontal`, `Brain` | Code, settings and model defaults, memory. |
| `Moon`, `Sun` | Theme toggle. |
| `Copy`, `ExternalLink`, `Link2` | Copy, open elsewhere, a repository link. |
| `Database`, `Sparkles`, `Plug` | Surfaces marked "em breve". |

To list every icon in use today, search `apps/web/src` for `from 'lucide-react'`. Imports span several lines, so read the whole import, not the matching line.

## Model provider logos

The model button shows provider logos from `@mastra/playground-ui` (`AnthropicMessagesIcon`, `OpenAIIcon`, `GoogleIcon` and the rest). Those are brand marks of third parties, not Lucide icons. Keep them only in model pickers and model rows.

## Never

No icon font, no emoji, no Unicode glyph standing in for an icon, no PNG icon, no second icon library.
