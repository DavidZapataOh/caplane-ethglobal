import { createServer } from 'node:http'
import { type ConfirmDeps, routeConfirm } from './confirm.js'
import type { Index } from './index-state.js'

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  // POST is here for the confirmation channel only. The activity feed stays read-only and answers
  // 405 to anything but GET.
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

/** The snapshot carries the head and the cursor as bigint, and JSON.stringify throws on one. */
const json = (value: unknown) =>
  JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner))

/**
 * Two routes and a 404.
 *
 * `/health` keeps the contract the deployment is pinned to: 200 `ok`, and everything else a 404
 * carrying `not found`. The 404 is what distinguishes this responder from a platform placeholder,
 * so the new route sits beside it rather than on top of it.
 *
 * There is deliberately no route that answers whether a right is taken. The threat model closes
 * registrar equivocation on the ground that no view is served by an operator, and a lookup here
 * would reopen it. That question is answered by reading the chain.
 *
 * The confirmation channel hangs off the same server because it is the same process: stopping this
 * service stops both, which is written down where the outage is planned.
 */
export const createApi = (index: Index, deps: ConfirmDeps = {}) =>
  createServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, CORS)
      return response.end()
    }
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain', ...CORS })
      return response.end('ok')
    }
    if (request.url === '/activity') {
      if (request.method !== 'GET') {
        response.writeHead(405, { 'content-type': 'text/plain', ...CORS })
        return response.end('method not allowed')
      }
      response.writeHead(200, { 'content-type': 'application/json', ...CORS })
      // `source` travels in the body because this is a convenience layer and never a source of
      // truth: the chain id, the four addresses and the height it was built at come with it, so
      // the answer can be redone without believing this service.
      return response.end(json({ source: 'chain', ...index.snapshot() }))
    }
    void routeConfirm(request, response, CORS, deps).then((handled) => {
      if (handled) return
      response.writeHead(404, { 'content-type': 'text/plain', ...CORS })
      response.end('not found')
    })
  })
