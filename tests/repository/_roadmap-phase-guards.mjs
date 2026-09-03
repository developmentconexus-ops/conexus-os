export function assert4DOpeningIsProperlyGated(roadmap, message = '4D opened before 4C closure') {
  const open = /\|\s*4D\b[^|\n]*\|\s*(?:OPEN|ACTIVE)\b/.test(roadmap) || /^4D\s*=\s*OPEN\b/m.test(roadmap)
  if (!open) return

  const closure = /4C\s*=\s*CLOSED \/ OPERATOR RATIFIED \/ METHOD v2\.3 \/ P12 CLOSED \/ 4C-13 CLOSED \/ P12-F03 CLOSED \/ 4C-14 CLOSED/.test(roadmap)
  if (!closure) throw new Error(message)
}
