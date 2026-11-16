// Offline stand-in for '@/lib/supabase' in student cache tests. Tests assign a
// handler per RPC name or table; every call is recorded.
type Result = { data: unknown; error: unknown }
type Handler = (args: unknown) => Result | Promise<Result>

export const calls: [string, string, unknown?][] = []
export const rpcs: Record<string, Handler> = {}
export const tables: Record<string, () => Result> = {}

function thenable(run: () => Result | Promise<Result>) {
  const request = {
    abortSignal() { return request },
    then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve().then(run).then(resolve, reject)
    },
  }
  return request
}

export const supabase = {
  rpc(name: string, args?: unknown) {
    calls.push(['rpc', name, args])
    return thenable(() => {
      const handler = rpcs[name]
      if (!handler) throw new Error(`No stub for rpc ${name}`)
      return handler(args)
    })
  },
  from(table: string) {
    calls.push(['from', table])
    const query = {
      select() { return query },
      eq() { return query },
      order() { return query },
      abortSignal() { return query },
      maybeSingle() { return query },
      then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve().then(() => (tables[table] ?? (() => ({ data: null, error: null })))()).then(resolve, reject)
      },
    }
    return query
  },
}
