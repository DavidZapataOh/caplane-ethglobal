import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SDK_INDEX = join(import.meta.dirname, '../../../sdk/src/index.ts')
const SDK_DOCS_DIR = join(import.meta.dirname, '../../content/docs/sdk')
const MCP_TOOLS_SOURCE = join(import.meta.dirname, '../../../services/mcp/src/tools.ts')
const MCP_DOC = join(import.meta.dirname, '../../content/docs/mcp.mdx')

/**
 * Every export of `sdk/src/index.ts` — functions, constants and types alike — read as text rather
 * than imported: this must run whether or not the package has been built. The reference documents
 * types as well as calls, so the drift guard covers both.
 */
export const sdkExports = (): string[] => {
  const source = readFileSync(SDK_INDEX, 'utf8')
  const names: string[] = []
  for (const statement of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const member of statement[1]!.split(',')) {
      const trimmed = member.trim().replace(/^type\s+/, '')
      if (trimmed === '') continue
      names.push(trimmed.split(/\s+as\s+/)[0]!.trim())
    }
  }
  return names
}

/** Every reference heading (`### \`name\``) across `content/docs/sdk/*.mdx`. */
export const documentedSdkExports = (): string[] => {
  const names: string[] = []
  for (const file of readdirSync(SDK_DOCS_DIR)) {
    if (!file.endsWith('.mdx')) continue
    const source = readFileSync(join(SDK_DOCS_DIR, file), 'utf8')
    for (const heading of source.matchAll(/^###\s+`([^`]+)`/gm)) {
      names.push(heading[1]!)
    }
  }
  return names
}

/**
 * Every tool name in `services/mcp/src/tools.ts`'s `TOOLS` array, read as text rather than
 * imported: this must run without the service having been built.
 */
export const mcpTools = (): string[] => {
  const source = readFileSync(MCP_TOOLS_SOURCE, 'utf8')
  return [...source.matchAll(/^\s*name:\s*'([^']+)'/gm)].map((match) => match[1]!)
}

/** Every reference heading (`### \`name\``) in `content/docs/mcp.mdx`. */
export const documentedMcpTools = (): string[] => {
  const source = readFileSync(MCP_DOC, 'utf8')
  return [...source.matchAll(/^###\s+`([^`]+)`/gm)].map((heading) => heading[1]!)
}
