// The plan template (builder-skills/conexus-plan) writes the person's part first and the technical
// part after the heading `## Para construir`. The match ignores case so a model that writes
// `## Para Construir` is split the same way. tests/implementation/builder-plan-sections.test.mjs
// keeps this heading and the template in step.
const technicalStart = /^##[ \t]+Para construir[ \t]*$/im

/** The part of a plan the person reads first. A plan without the technical heading is all theirs. */
export const personPart = (plan: string): string => {
  const start = plan.search(technicalStart)
  return start === -1 ? plan : plan.slice(0, start).trimEnd()
}
