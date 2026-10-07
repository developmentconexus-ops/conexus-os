# Study report template

Copy this into the report and fill each section. A part fills only the sections its instructions
name.

```markdown
# Study: <wave or question>

**Date**: YYYY-MM-DD
**Base**: `main` at <commit>
**Earlier studies used**: <where, and what this study corrects in them>

## 1. Short answer

<Three to five plain sentences: what is wrong, its root cause, what the references do, what the
wave should do.>

## 2. Today (census)

Command: `<one command that reruns it>`

| Mechanism | Count | Where (`file:line`, or the census output) |
| --- | --- | --- |

<How it works now, from entry point to effect: Overview, key concepts, where things live, gotchas.>

## 3. Why it is so

<The specs, pull requests and decisions that produced today's shape, with links. What each was
solving.>

## 4. References

### Sources and versions

| Reference | Version or commit | What we read |
| --- | --- | --- |

### The questions

<The same numbered questions for every reference, written for this subject.>

### <Reference A>

<Answer each question with `file:line` and a short verbatim snippet.>

### Comparison

| Question | Reference A | Reference B | ... | Conexus today |
| --- | --- | --- | --- | --- |

Where all agree: <...>
Where they differ, and why: <...>

### What we copy and what we adapt

| Mechanism | Copy from (`repo/file:line`) | Kept as is | Adapted, and why |
| --- | --- | --- | --- |

<This table becomes the spec's "References copied".>

## 5. The premise

- **The question as it arrived**: <...>
- **Why, until the root cause**: 1. <...> 2. <...> ...
- **Root cause**: <one sentence>
- **The premise held / fell**: <and what the real question is>

## 6. Proved and not proved

| Claim | How it was tested | Result |
| --- | --- | --- |

Not verified: <list>

## 7. Findings against the guides

| Finding | Guide section | `file:line` |
| --- | --- | --- |

## 8. What the wave wants

- **Wants**: <...>
- **Stays out**: <...>
- **Done when**: <checkable lines a reviewer can confirm>
- **Lane**: lane:shaped | lane:qualification (<trigger>)

## 9. Decisions for the operator

1. <question> Options: <A, B>. Recommendation: <A>, because <reference and reason>.
   **Answer** (<date>): <...>

## 10. Draft for the spec

<The data shape, where each thing lives, the cut list (what leaves), what does not enter. The spec
writer starts here.>
```
