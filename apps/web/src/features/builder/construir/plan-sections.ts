// The Planejar prompt (apps/hub/src/builder/harness/prompt/v2/plan.md) asks for a plan in two parts,
// the person's first and Construir's after it, and names the heading that starts the second.
// tests/implementation/builder-plan-sections.test.mjs keeps the prompt and this heading in step.
const technicalStart = /^##[ \t]+Para Construir[ \t]*$/m

/** The part of a plan the person reads first. A plan without the technical heading is all theirs. */
export const personPart = (plan: string): string => {
  const start = plan.search(technicalStart)
  return start === -1 ? plan : plan.slice(0, start).trimEnd()
}
