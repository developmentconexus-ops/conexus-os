# 4D OPP-C09 — Richer Design System and Headless Primitives Study

> **Status:** `PASS 1 OPERATOR APPROVED / TWO-TIER VISUAL ROAD + FE-11 PROMOTED / HEADLESS-STYLING SELECTION OPEN`
> **Method:** Frontend Product Experience Planning Method v2.3
> **Inputs:** locked 4C/P13/P10/P11/P12; frontend owner; FE-01..10; SCF/CON; Budget Analyzer R5; FE-09 Product Agent road
> **Research date:** `2026-08-29`
> **Production component/styling prototype:** `NOT PERFORMED / 4D-C BOUNDED COMPARISON REQUIRED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

What visual/component foundation makes Conexus and Builder-generated applications
fast, accessible, coherent and maintainable without turning a library into
Product authority or forcing one visual shell across unlike Products?

## 2. Two-tier architecture

### Tier A — Conexus Platform visual system

The 13 locked Control Plane blocks and current P11 are current consumers of one
coherent styled visual/component layer:

```text
locked Screen Contracts + P13
→ accessible headless behavior wrappers
→ Platform semantic tokens and styled components
→ exact block-specific composition
→ structural/interaction/accessibility/visual Evidence
```

The Platform may standardize its shell, typography, color, spacing, density,
motion, icons and component styling after bounded visual adjudication. It cannot
standardize away owner-specific Product meaning.

### Tier B — Builder-generated Project application foundation

Published applications receive a different contract:

```text
generated wire/session/security/error/accessibility seams
+ optional neutral accessible primitives/token infrastructure
+ seed visual profile with exact version/ownership
→ Project-owned Product UI, brand, theme, composition and renderers
```

The Budget Analyzer consumes this foundation in R5 but its visual Product design
remains `FUTURE_PRODUCT_APP`. No C09 decision invents its layout or imports the
Control Plane rail. FE-09 Product Agent hosts likewise remain Project-composed.

Project apps need explicit extension zones and an eject/replace path. Generator
upgrade compares/regenerates owned output; it never silently overwrites app-owned
styles/components.

## 3. Authority layers

```text
Screen Contract / P13
  = structural/interaction authority

headless primitive
  = reusable focus/keyboard/overlay/form/collection mechanics

visual profile/tokens/styles
  = replaceable realization

story/test/screenshot/a11y report
  = Evidence
```

Headless/component state is only `FORM_DRAFT` or `EPHEMERAL_UI` unless it projects
an exact `SERVER`/`URL_NAVIGATION` input. A primitive cannot create authorization,
currentness, business state, owner lifecycle, decision or success truth.

Design tokens express visual meaning:

```text
allowed:   color.surface.danger, density.compact.row, focus.ring.width
forbidden: approval.authorized, run.succeeded, canDelete, primaryAction
```

## 4. P13 and repeated interaction contract

Visual/component realization must preserve:

- reading order and region priority;
- primary/secondary action placement;
- interaction model and navigation meaning;
- density class and material information visibility;
- wide/narrow responsive transformation;
- focus entry/return, keyboard path, dismissal and exact trigger locality;
- persistent labels, error/recovery announcement and non-color meaning;
- distinct loading/empty/denied/absent/stale/partial/unsupported/indeterminate/failure;
- a complete `prefers-reduced-motion` audit.

Terminal P10 behaviors may share implementation mechanics but not semantic APIs:

- adaptive current-scope Platform shell;
- human-first exact reference presentation;
- context-preserving exact-subject panel;
- owner-paged honest collection;
- exact-current guarded action;
- consequence-first exact decision.

Still-single-instance structures—Builder/right-Conexus, P-02 four lenses,
PA-01 three hosts and Agent Studio—do not justify generic components by analogy.

## 5. Headless primitive candidates

### React Aria Components

Strongest observed breadth: overlays/focus, forms/validation, advanced collections,
table/tree/virtualization, async loading, drag-and-drop, date/time and deep i18n/
RTL. Style-free parts/slots/render props and lower-level hooks provide escape
hatches. The dependency/context graph is broad and duplicate internal versions
can break overlay/router behavior.

**Disposition:** `ADVANCE / LEADING BEHAVIORAL PROTOTYPE`.

### Base UI

Strong low-level React-specific substrate with accessible overlays, focus,
combobox/select/forms, drawer/toast, open parts and styling freedom. One
tree-shakeable package simplifies ownership. It is newer and less deep than React
Aria for complex collections/date/i18n; recent SSR/hydration fixes require proof.

**Disposition:** `ADVANCE / LEADING LOW-LEVEL PROTOTYPE`.

### Radix Primitives

Mature accessible control for common overlay/navigation/form primitives, with
granular parts, portals, controlled/uncontrolled state and `asChild` composition.
Its catalog lacks the advanced collection/table/tree/date breadth needed to
assume universal coverage.

**Disposition:** `MATURE CONTROL / REQUIRED REPRESENTATIVE PROTOTYPE`.

### Ark UI / Zag

Broad cross-framework state-machine components and useful complex widgets. React
is the accepted road, so cross-framework breadth is not current value, and machine
state must remain client mechanics. Current composition churn increases risk.
Commercial Ark Plus terms are incompatible with distributing an end-user Builder.

**Disposition:** `STATE-MACHINE CHALLENGER ONLY WHEN A UNIQUE COMPLEX WIDGET FIRES`;
`ARK PLUS REJECT FOR BUILDER DISTRIBUTION`.

### Ariakit and Headless UI

Ariakit is a focused accessibility/store reference but remains 0.x with smaller
breadth. Headless UI is a solid narrow forms/overlay/Tailwind option but would
force Conexus to rebuild advanced collection behavior.

**Disposition:** `BOUNDED REFERENCES / NOT UNIVERSAL SUBSTRATE`.

### shadcn/ui

shadcn is a source-distribution/registry pattern, not headless behavior authority.
Copied source is attractive for Project ownership and visual divergence but
creates fork/update/provenance risk. Any use pins base, item version/hash,
registry and generated files; upgrades produce reviewed diffs and rerun all
P13/a11y proofs.

**Disposition:** `ADVANCE AS PROJECT DISTRIBUTION/OWNERSHIP CHALLENGER`.

## 6. Styling and token candidates

### Native CSS custom properties + CSS Modules

Best control/baseline: runtime theming through native variables, local style
scope, minimal lock-in and direct app ownership. Taxonomy/typing/lint discipline
must be supplied deliberately.

**Disposition:** `REFERENCE BASELINE / MAXIMUM ESCAPE HATCH`.

### Tailwind CSS v4

Strong scaffold-speed challenger with CSS-first `@theme`, generated custom
properties, responsive/container queries and zero runtime. Static text scanning
cannot see dynamically constructed classes; arbitrary values can bypass tokens
and copied utility markup couples source to vocabulary.

**Disposition:** `STRONG GENERATED-APP CHALLENGER / EXTRACTION+TOKEN-BYPASS PROOF`.

### Panda CSS

Strong typed token/recipe/slot-recipe candidate for the Platform design system,
with build-time CSS and rich conditions. Generated `styled-system`, static
extraction exceptions and lightweight runtime add a larger tool-owned surface.

**Disposition:** `STRONG PLATFORM TYPED-SYSTEM CHALLENGER`.

### vanilla-extract

Static CSS, typed theme contracts/variables, local classes and smaller abstraction
than Panda. Bundler integration, `.css.ts`, portals/themes and runtime class
selection require proof.

**Disposition:** `LOWER-ABSTRACTION PLATFORM CHALLENGER`.

### DTCG / Style Dictionary

DTCG provides a current stable token interchange format, not visual authority.
Style Dictionary is a generation candidate but current full DTCG 2025.10 support
is still evolving. Token transforms/aliases/output need conformance.

**Disposition:** `INTERCHANGE BOUNDARY CHALLENGER / NOT ASSUMED PIPELINE`.

## 7. Generated ownership and upgrade law

Every visual foundation generation records:

```text
generator/template/token-profile/headless/styling versions
+ input/output digests
+ file ownership class
+ extension/eject boundary
+ conformance scenario identities
```

Useful physical classifications may include replaceable generated output,
protected generated/platform output and app-owned source, but exact manifest
schema/names remain B05/4D-A work. The semantic law is fixed:

- upstream component updates never silently change locked interaction;
- local app edits never weaken protected accessibility/session/wire seams;
- regeneration preserves Project visual composition and theme;
- a Project can replace the optional visual/headless foundation without forking
  Product authority or losing the platform security/wire contract.

## 8. Component and visual proof stack

Complementary proof layers:

1. Testing Library — semantic behavior and user-recognizable queries;
2. Storybook — deterministic state catalog and interaction stories;
3. axe — automated accessibility first line, never complete proof;
4. Playwright — real route/journey, responsive/theme/density/motion and visual diff;
5. manual keyboard/screen-reader/touch/zoom/forced-colors review;
6. Chromatic — optional managed cross-browser/review challenger.

Each scenario binds:

```text
screenContractId + approvedBlob + scenarioId
material regions/controls
theme + density + viewport/container + motion preference
auth/disclosure fixture
semantic assertions
optional visual-baseline environment identity
```

Story/screenshot/token change does not update authority. A delta is classified as
faithful realization, visual-only intentional delta or structural drift. Structural
drift reopens the smallest Screen Contract/P13 owner.

Visual comparison pins browser/runtime/OS/fonts/images/viewport. Pixel evidence
cannot replace operable keyboard/focus/state/responsive proof. Chromatic remains
optional because service browser upgrades, data/cost/retention and exit path are
external decisions; Playwright local preserves a sovereign fallback.

## 9. Required bounded prototype matrix

Before selection, implement outside Product code the same exact cases:

1. governed form/decision — Base UI, React Aria and Radix control;
2. nested modal/nonmodal overlay — portal, stacking, Escape/outside, scroll lock,
   initial/final focus, trigger removal and SSR/hydration;
3. dense dynamic collection — 1k items, async/infinite/virtualized data, table/tree,
   typeahead/multiselect, deletion focus and touch;
4. P13 shell neutrality — same locked block in two themes and Platform versus
   generated-app composition, wide/narrow/RTL/high-contrast/zoom/reduced-motion;
5. distribution drift — direct winning substrate versus private shadcn-compatible
   registry item, exact hashes, Project edit, generator upgrade and diff;
6. styling matrix — CSS Modules/custom properties control versus Tailwind/Panda/
   vanilla-extract on button/dialog/table/master-detail;
7. proof calibration — Storybook/Testing Library/axe/Playwright local versus
   optional Chromatic.

Measure correctness, accessibility, P13 fidelity, bundle/CSS/build/HMR,
dependencies/duplicates, SSR/hydration, theme/portal behavior, app ownership,
regeneration/upgrade/eject, license/SBOM and Builder maintenance quality.

## 10. Ledger adjudication

1. `FE-06` is refined to make post-visual/component P13 conformance cover density,
   wide/narrow, focus/keyboard/labels/non-color and reduced motion;
2. `FE-07` is refined to protect Project-owned visual composition, brand/theme
   and renderers while allowing an optional neutral foundation;
3. new `FE-11` makes the two-tier primitive/component authority boundary
   independently falsifiable;
4. `FE-09`, `SCF-01/03/04/05/06` and `CON-01/04/05` remain reused, not copied.

No DesignSystem Product owner, token business domain, universal component API,
Screen Contract registry replacement or app-shell inheritance is introduced.

## 11. Required falsifiers

1. `C09-P1`: visual/component candidate cannot realize a locked P13 structure/state/focus/responsive behavior without redesign.
2. `C09-P2`: visual delta changes reading order, region/action priority, density, navigation or material visibility and triggers smallest-owner reopen.
3. `C09-P3`: primitive collapses unknown/denied/stale/failure into empty/success or infers auth/currentness.
4. `C09-P4`: generic component requires owner DTO/lifecycle/status/Permission semantics and fails FE-11.
5. `C09-P5`: same primitive works across unlike owners without merging identity/lifecycle/decision semantics.
6. `C09-P6`: Project app can use a distinct brand/theme/composition without editing protected seams or inheriting Control Plane shell.
7. `C09-P7`: regeneration/upgrade cannot overwrite app-owned UI or silently change locked interaction.
8. `C09-P8`: Project replacement/eject of optional visual foundation preserves generated wire/session/security/accessibility contracts.
9. `C09-P9`: form and overlay matrix preserves native submit, server errors, labeling, keyboard/dismiss/focus return and SSR hydration.
10. `C09-P10`: dense collection preserves paging/loaded-scope honesty and widget state never becomes owner truth.
11. `C09-P11`: theme/density/reduced-motion/RTL/high-contrast/zoom reach portals and retain material meaning.
12. `C09-P12`: Tailwind dynamic classes/arbitrary values, Panda extraction/runtime or vanilla-extract portal/theme gaps turn relevant controls red.
13. `C09-P13`: token change blast radius is explicit; raw-value bypass or Product-state token is rejected.
14. `C09-P14`: story/screenshot/axe green cannot override semantic/browser/manual failure or become acceptance authority.
15. `C09-P15`: visual baseline pins environment/fixtures; flake or browser upgrade is explicit rather than accepted drift.
16. `C09-P16`: registry item cannot inject unrelated files/dependencies, change base silently or lose provenance.
17. `C09-P17`: Ark/Zag state remains client mechanics; Ark Plus end-user-tool restriction blocks distribution.
18. `C09-P18`: package docs/feature count cannot select a winner before equal-envelope prototype Evidence.

## 12. Current primary sources

- [React Aria Components](https://react-aria.adobe.com/) and
  [React Spectrum SSR](https://react-spectrum.adobe.com/v3/ssr.html);
- [Base UI](https://base-ui.com/react/overview/about),
  [accessibility](https://base-ui.com/react/overview/accessibility) and
  [releases](https://base-ui.com/react/overview/releases);
- [Radix Primitives](https://www.radix-ui.com/primitives/docs),
  [accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)
  and [composition](https://www.radix-ui.com/primitives/docs/guides/composition);
- [Ark UI](https://ark-ui.com/docs/overview/about),
  [Ariakit](https://ariakit.org/components), [Headless UI](https://headlessui.com/)
  and [shadcn/ui registry](https://ui.shadcn.com/docs/registry);
- [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files),
  [Panda dynamic styling](https://panda-css.com/docs/guides/dynamic-styling),
  [vanilla-extract](https://github.com/vanilla-extract-css/vanilla-extract),
  [CSS Modules](https://github.com/css-modules/css-modules/blob/master/docs/get-started.md),
  [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) and
  [Style Dictionary DTCG](https://styledictionary.com/info/dtcg/);
- [Storybook testing](https://storybook.js.org/docs/writing-tests),
  [Testing Library](https://testing-library.com/docs/),
  [Playwright visual comparison](https://playwright.dev/docs/test-snapshots),
  [Playwright accessibility](https://playwright.dev/docs/accessibility-testing)
  and [Chromatic snapshots](https://www.chromatic.com/docs/snapshots/).

## 13. Independent challenge and adjudication

Three fresh reviewers independently reconstructed P13/owner constraints,
headless primitive candidates and styling/token/proof mechanisms. They converged
on the two-tier boundary, equal-envelope prototype need and the separation of
contract, behavior, visual realization and Evidence.

Lead accepted one new protected delta: `FE-11`. It prevents an advanced library
from becoming semantic authority or forcing the Control Plane shell/brand onto
Project apps. No reviewer selected a package or created Product meaning.

## 14. Pass-1 outcome

```text
OPP-C09 PASS 1 = OPERATOR APPROVED
two-tier Platform visual system + Project visual foundation = REQUIRED
FE-06/FE-07 = REFINED
FE-11 = PROMOTE TO 4D PROPERTY CONTRACTS
React Aria Components = LEADING BEHAVIORAL PROTOTYPE
Base UI = LEADING LOW-LEVEL PROTOTYPE
Radix Primitives = MATURE CONTROL
Ark/Zag = UNIQUE COMPLEX-WIDGET CHALLENGER
Ark Plus = REJECT FOR BUILDER DISTRIBUTION
shadcn/ui = PROJECT SOURCE-DISTRIBUTION CHALLENGER / NOT BEHAVIOR AUTHORITY
CSS custom properties + CSS Modules = REFERENCE BASELINE
Tailwind CSS v4 = STRONG GENERATED-APP CHALLENGER
Panda CSS = STRONG PLATFORM TYPED-SYSTEM CHALLENGER
vanilla-extract = LOWER-ABSTRACTION PLATFORM CHALLENGER
DTCG/Style Dictionary = TOKEN-INTERCHANGE CHALLENGER
Storybook/Testing Library/axe/Playwright = COMPLEMENTARY EVIDENCE MECHANISMS
Chromatic = OPTIONAL MANAGED VISUAL-REVIEW CHALLENGER
new Product owner/operation/record/state class = 0
exact headless/styling/token/proof package/version = 0
Product implementation authority = 0
```
