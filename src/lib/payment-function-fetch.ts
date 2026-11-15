/** Route only grading checkout to the local server in development. Auth, data,
 * storage and other functions continue to use the configured Supabase project. */
export function paymentFunctionFetch(projectUrl: string, localUrl: string, fetcher: typeof fetch = fetch): typeof fetch {
  const project = new URL(projectUrl).origin
  const local = new URL(localUrl)
  if (!['localhost', '127.0.0.1'].includes(local.hostname) || !['http:', 'https:'].includes(local.protocol)) {
    throw new Error('VITE_PAYMENT_FUNCTIONS_URL must be a localhost URL.')
  }
  return (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin === project && url.pathname === '/functions/v1/create-grading-checkout') {
      return fetcher(new Request(new URL(url.pathname, local.origin), request))
    }
    return fetcher(input, init)
  }
}
