/** Only existing ASK URL tags from this site may be submitted for attendance. */
export function tokenFromNdefRecords(
  records: Iterable<{ recordType: string; data: DataView | null }>,
  origin: string,
): string | null {
  for (const record of records) {
    if (record.recordType !== 'url' || !record.data) continue
    try {
      const url = new URL(new TextDecoder('utf-8', { fatal: true }).decode(record.data))
      const params = url.searchParams
      const token = params.get('tag')
      if (url.origin === origin && url.pathname === '/instructor/nfc_checkin' &&
        !url.hash && !url.username && !url.password && [...params.keys()].length === 1 &&
        token && /^[0-9a-f]{64}$/i.test(token)) return token.toLowerCase()
    } catch {
      // Malformed or non-URL records are not check-in credentials.
    }
  }
  return null
}
