// Pure presentation logic shared by the Edge Function and browser renderer.
// Only remove explicitly labelled provenance, not ordinary schedule details,
// attendance totals, errors, or partial-results warnings.
const sourceLabel = /^(?:sources?|citations?|references)\s*(?::|$)/i
const sourceHeading = /^(?:sources?|citations?|references)\s*:?\s*$/i
const toolName = /\b(?:get_my_schedule|get_my_availability|get_student_history|get_student|search_students)\b/

export function cleanChatReply(content: string): string {
  const kept: string[] = []
  let sourceSection = false
  let fence: string | null = null
  for (const block of content.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n/)) {
    const lines = block.split('\n')
    const fenced = fence !== null || /^\s*(?:`{3,}|~{3,})/.test(lines[0])
    if (fenced) {
      for (const line of lines) {
        const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1]
        if (!marker) continue
        if (!fence) fence = marker
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      }
      sourceSection = false
      kept.push(block)
      continue
    }
    const label = lines[0].replace(/^\s*(?:>\s*)?(?:#{1,6}\s*)?(?:[-+]\s+)?/, '').replace(/[*_`]/g, '').trim()
    if (sourceLabel.test(label)) {
      sourceSection = sourceHeading.test(label)
      continue
    }
    if (sourceSection && (/^\s*(?:[-*+]|\d+\.)\s/.test(block) || toolName.test(block))) continue
    sourceSection = false

    // Some models append the footer to the answer's final paragraph. Limit
    // inline removal to known tool metadata so ordinary prose stays intact.
    const inline = /\s+[*_`]*(?:sources?|citations?|references)[*_`]*\s*:\s*/i.exec(block)
    kept.push(inline && toolName.test(block.slice(inline.index)) ? block.slice(0, inline.index).trimEnd() : block)
  }
  return kept.join('\n\n').trim()
}
