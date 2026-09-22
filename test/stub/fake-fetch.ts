export function fakeFetchServer() {
  const responses = new Map<string, [number, Record<string, string>, string]>()
  let failure: unknown
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (failure) throw failure
      const [status, headers, body] = responses.get(url) ?? [404, {}, '']
      return new Response(body, { status, headers })
    })
  )
  return {
    respondWith(
      ...args:
        | [string, [number, Record<string, string>, string]]
        | [string, string, [number, Record<string, string>, string]]
    ) {
      const [url, response] =
        args.length === 2 ? args : (args.slice(1) as [string, [number, Record<string, string>, string]])
      responses.set(url, response)
    },
    fail(error: unknown) {
      failure = error
    },
    restore() {
      vi.unstubAllGlobals()
    }
  }
}
export type FakeFetchServer = ReturnType<typeof fakeFetchServer>
