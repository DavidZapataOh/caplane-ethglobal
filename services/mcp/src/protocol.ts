import { INSTRUCTIONS, TOOLS, call } from './tools.js'

/**
 * The versions this server speaks.
 *
 * The current specification revision is later than any of these, and it removes `initialize`,
 * sessions and the listening stream. Nothing implements it yet — the official SDK itself declares
 * 2025-11-25 as its latest — so the legacy era is what a real client will ask for. Dispatch is a
 * pure function precisely so the newer era arrives as another branch rather than another server.
 */
export const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const

export const SERVER_INFO = { name: 'caplane-registry', version: '0.1.0' } as const

type Request = { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Record<string, unknown> }

export const result = (id: Request['id'], value: unknown) => ({ jsonrpc: '2.0' as const, id, result: value })
export const failure = (id: Request['id'], code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0' as const,
  id,
  error: data === undefined ? { code, message } : { code, message, data },
})

/** A message with no id is a notification: there is nothing to answer, and answering breaks clients. */
export const isNotification = (message: Request): boolean => message.id === undefined || message.id === null

export const dispatch = async (message: Request): Promise<unknown> => {
  const { id, method, params = {} } = message
  if (method === 'initialize') {
    const asked = String(params.protocolVersion ?? '')
    const version = (VERSIONS as readonly string[]).includes(asked) ? asked : VERSIONS[0]
    return result(id, {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    })
  }
  if (method === 'ping') return result(id, {})
  if (method === 'tools/list') return result(id, { tools: TOOLS })
  if (method === 'tools/call') {
    const name = String(params.name ?? '')
    const args = (params.arguments ?? {}) as Record<string, unknown>
    try {
      return result(id, await call(name, args))
    } catch (error) {
      // An unknown tool is a protocol error; a bad argument is not. The first means the client read
      // a tool list that does not match this server, and it should stop rather than retry.
      return failure(id, -32602, (error as Error).message)
    }
  }
  return failure(id, -32601, `Method not found: ${String(method)}`)
}
