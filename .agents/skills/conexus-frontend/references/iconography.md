# Iconography

Lucide is the only icon set. Import each icon from `lucide-react`, which `package.json` declares. To see the icons in use, search `apps/web/src` for `from 'lucide-react'` (imports span lines, so read the whole import) and reuse the icon that already means the thing.

## Drawing

- Keep Lucide's defaults: outline, stroke 2, round caps and joins. Do not pass `strokeWidth`.
- Color comes from `currentColor`: set it on the parent with a token (`--cx-text-2` idle, `--cx-text` on hover, `--cx-accent-text` on an ipê hover). An icon never gets its own color value.
- The stop control is the one filled icon: `Square` with `fill="currentColor"`.
- Take the size from the neighbor: 16px in buttons and inline, 14px for chevrons and toolbars, 18px in the scope rail. Larger sizes belong to the mark and empty-state emblems, which use `ConexusMark`, not Lucide.

## Meaning

- One icon, one meaning. Check that no icon already says it before adding one, and give a second meaning its own icon rather than reusing.
- An icon never carries status alone: pair it with a word.

## Accessibility

- A decorative icon beside a text label takes `aria-hidden="true"`.
- An icon-only button carries a pt-BR `aria-label` that names the action ("Tema escuro", "Anexar arquivo"), and a Mastra `Tooltip` with the same words when the icon is not self-evident.

## Model provider logos

The logos in a model picker (`AnthropicMessagesIcon`, `OpenAIIcon`, `GoogleIcon`) come from `@mastra/playground-ui`. They are third-party brand marks, kept to model pickers and model rows.

## Never

No icon font, no emoji, no Unicode glyph standing in for an icon, no PNG icon, no second icon library.
