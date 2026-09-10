import { createServer } from 'node:http'

/**
 * A placeholder until the real surface lands. It exists because the platform will not consider
 * a deploy healthy — and will not issue a certificate — for a service that binds no port, so
 * without a listener the domain cannot resolve over TLS on day zero.
 */
const port = Number(process.env.PORT)
if (!Number.isFinite(port) || port === 0) throw new Error('PORT is not set')

createServer((request, response) => {
  const healthy = request.url === '/health'
  response.writeHead(healthy ? 200 : 404, { 'content-type': 'text/plain' })
  response.end(healthy ? 'ok' : 'not found')
}).listen(port)
