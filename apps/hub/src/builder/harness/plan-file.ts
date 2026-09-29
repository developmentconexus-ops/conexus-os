// Copied from @mastra/code-sdk 1.8.3: dist/utils/plans.js (readPlanFile's title and body split).
// Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0); see
// @mastra/code-sdk's LICENSE.md. Changed: it splits text already read through the run's workspace
// instead of reading a local path itself. Only the file's home becomes Conexus's.

/**
 * A plan file's text as the card shows it: a leading `# <title>` heading becomes the title and the
 * rest the body; a file without one has no title and is the body whole.
 */
export const splitPlanFile = (raw: string): Readonly<{ title: string; plan: string }> => {
  const lines = raw.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => line.trim().length > 0)
  const heading = headingIndex >= 0 ? lines[headingIndex] : undefined
  if (heading?.startsWith('# ')) {
    return { title: heading.slice(2).trim(), plan: lines.slice(headingIndex + 1).join('\n').replace(/^\n+/, '').trimEnd() }
  }
  return { title: '', plan: raw.trimEnd() }
}
