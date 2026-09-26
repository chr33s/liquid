import { join } from 'node:path'
import { serve } from 'srvx'
import { Liquid } from '@chr33s/liquid'

const root = import.meta.dirname
const engine = new Liquid({
  root: join(root, 'views'),
  extname: '.liquid',
  layouts: join(root, 'partials'),
  partials: join(root, 'partials')
})

const todos = ['fork and clone', 'make it better', 'make a pull request']

const server = serve({
  port: 3000,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    const url = new URL(request.url)
    if (request.method !== 'GET' || url.pathname !== '/') {
      return new Response('Not Found', { status: 404 })
    }
    const html = await engine.renderFile('todolist', {
      todos,
      title: 'Welcome to LiquidJS!'
    })
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }
})

await server.ready()
console.log(`srvx running: ${server.url}`)
