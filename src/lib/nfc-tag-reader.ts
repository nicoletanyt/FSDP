/** Accept opaque NDEF text tokens, plus existing same-origin URL tags during migration. */
export function tokenFromNdefRecords(
  records: Iterable<{ recordType: string; data: DataView | null; encoding?: string }>,
  origin: string,
): string | null {
  for (const record of records) {
    if ((record.recordType !== 'url' && record.recordType !== 'text') || !record.data) continue
    try {
      const value = new TextDecoder(record.recordType === 'text' ? record.encoding ?? 'utf-8' : 'utf-8', { fatal: true }).decode(record.data)
      if (record.recordType === 'text') {
        if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase()
        continue
      }
      const url = new URL(value)
      const params = url.searchParams
      const token = params.get('tag')
      if (url.origin === origin && url.pathname === '/instructor/nfc_checkin' &&
        !url.hash && !url.username && !url.password && [...params.keys()].length === 1 &&
        token && /^[0-9a-f]{64}$/i.test(token)) return token.toLowerCase()
    } catch {
      // Malformed text or URL records are not check-in credentials.
    }
  }
  return null
}
