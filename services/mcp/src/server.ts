import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { VERSIONS, dispatch, failure, isNotification } from './protocol.js'

const ENDPOINT = '/mcp'

/**
 * The specification requires a server to validate `Origin` against DNS rebinding, and the official
 * SDK's own option for it is deprecated in favour of doing it yourself.
 *
 * A client that is not a browser sends no Origin at all, which is the normal case here and is
 * allowed. A browser origin is allowed if it is one of ours — or a loopback one, because the
 * official inspector is a browser application served from a loopback port, and refusing it made the
 * conformance suite's own DNS-rebinding scenario fail: `Expected HTTP 2xx for valid localhost
 * Host/Origin headers, got 403`. Refusing the tool everyone reaches for first is not security.
 */
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z]+\.)?caplane\.xyz$/,
  /^https?:\/\/localhost(:\d{2,5})?$/,
  /^https?:\/\/127\.0\.0\.1(:\d{2,5})?$/,
  /^https?:\/\/\[::1\](:\d{2,5})?$/,
]

const json = (response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(value))
}

const bodyOf = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString())
}

/**
 * Stateless by construction: no session id is issued, nothing is kept between requests, and there is
 * no listening stream to hold open. A read-only registry lookup has nothing to push, and a restart
 * has to cost a client nothing — which it does, because there is nothing to lose.
 *
 * `/health` keeps the contract the deployment is pinned to, so the platform's check and the 404 that
 * distinguishes this responder from a placeholder both survive.
 */
export const createMcp = () =>
  createServer((request, response) => {
    const url = request.url ?? ''
    const origin = request.headers.origin
    if (typeof origin === 'string' && origin !== '' && !ALLOWED_ORIGINS.some((allowed) => allowed.test(origin))) {
      return json(response, 403, { error: 'origin not allowed' })
    }
    if (url === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      return response.end('ok')
    }
    if (url !== ENDPOINT) {
      response.writeHead(404, { 'content-type': 'text/plain' })
      return response.end('not found')
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { 'content-type': 'text/plain', allow: 'POST' })
      return response.end('method not allowed')
    }
    const accept = String(request.headers.accept ?? '')
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      return json(
        response,
        406,
        failure(null, -32000, 'Not Acceptable: Client must accept both application/json and text/event-stream'),
      )
    }
    const asked = request.headers['mcp-protocol-version']
    if (typeof asked === 'string' && !(VERSIONS as readonly string[]).includes(asked)) {
      return json(response, 400, failure(null, -32000, `Unsupported MCP-Protocol-Version: ${asked}`, { supported: VERSIONS }))
    }
    void bodyOf(request)
      .then(async (message) => {
        const single = message as { id?: unknown }
        if (isNotification(single as never)) {
          // 202 with no body. Answering a fire-and-forget message makes strict clients read it as a
          // failed request.
          response.writeHead(202)
          return response.end()
        }
        return json(response, 200, await dispatch(single as never))
      })
      .catch(() => json(response, 400, failure(null, -32700, 'Parse error')))
  })
