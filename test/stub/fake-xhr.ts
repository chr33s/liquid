import { vi } from 'vitest'

export type FakeResponse = [number, { [header: string]: string }, string]

const statusTexts: { [status: number]: string } = {
  200: 'OK',
  404: 'Not Found',
  500: 'Internal Server Error'
}

interface Route {
  method?: string
  url: string
  response: FakeResponse
}

export class FakeXMLHttpRequest {
  static server: FakeXhrServer
  static onCreate: ((xhr: FakeXMLHttpRequest) => void) | undefined
  public status = 0
  public statusText = ''
  public responseText = ''
  public onload: (() => void) | null = null
  public onerror: (() => void) | null = null
  private method = 'GET'
  private url = ''
  private async = true
  private timer: ReturnType<typeof setTimeout> | undefined
  private done = false

  open(method: string, url: string, async = true) {
    this.method = method
    this.url = url
    this.async = async
  }

  send() {
    const server = FakeXMLHttpRequest.server
    server.requests.push(this)
    FakeXMLHttpRequest.onCreate?.(this)
    if (this.async) this.timer = setTimeout(() => this.respond())
    else this.respond()
  }

  error() {
    if (this.done) return
    this.done = true
    clearTimeout(this.timer)
    this.onerror?.()
  }

  private respond() {
    if (this.done) return
    this.done = true
    const [status, , body] = FakeXMLHttpRequest.server.match(this.method, this.url)
    this.status = status
    this.statusText = statusTexts[status] ?? ''
    this.responseText = body
    this.onload?.()
  }
}

export class FakeXhrServer {
  public requests: FakeXMLHttpRequest[] = []
  private routes: Route[] = []

  respondWith(...args: [string, FakeResponse] | [string, string, FakeResponse]) {
    const route: Route =
      args.length === 2 ? { url: args[0], response: args[1] } : { method: args[0], url: args[1], response: args[2] }
    this.routes.push(route)
  }

  match(method: string, url: string): FakeResponse {
    for (let i = this.routes.length - 1; i >= 0; i--) {
      const route = this.routes[i]
      if (route.url === url && (!route.method || route.method === method)) return route.response
    }
    return [404, {}, '']
  }

  restore() {
    FakeXMLHttpRequest.onCreate = undefined
    vi.unstubAllGlobals()
  }
}

export function fakeXhrServer() {
  const server = new FakeXhrServer()
  FakeXMLHttpRequest.server = server
  FakeXMLHttpRequest.onCreate = undefined
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  return server
}
