import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { documentedMcpTools, documentedSdkExports, mcpTools, sdkExports } from './coverage.ts'

const SDK_DOCS_DIR = join(import.meta.dirname, '../../content/docs/sdk')
const API_DOC = join(import.meta.dirname, '../../content/docs/api.mdx')
const MCP_DOC = join(import.meta.dirname, '../../content/docs/mcp.mdx')

test('every real sdk export has a reference section', () => {
  const real = sdkExports()
  const documented = documentedSdkExports()
  const missing = real.filter((name) => !documented.includes(name))
  assert.deepEqual(missing, [])
})

test('no section documents an export that does not exist', () => {
  const real = sdkExports()
  const documented = documentedSdkExports()
  const stale = documented.filter((name) => !real.includes(name))
  assert.deepEqual(stale, [])
})

test('every sdk doc page uses the real package name, never the scoped guess', () => {
  for (const file of readdirSync(SDK_DOCS_DIR)) {
    if (!file.endsWith('.mdx')) continue
    const source = readFileSync(join(SDK_DOCS_DIR, file), 'utf8')
    assert.match(source, /caplane-sdk/, `${file} never mentions caplane-sdk`)
    assert.equal(/@caplane\/sdk/.test(source), false, `${file} references the wrong package name`)
  }
})

test('every real mcp tool has a section in the guide', () => {
  const real = mcpTools()
  const documented = documentedMcpTools()
  assert.deepEqual(
    real.filter((name) => !documented.includes(name)),
    [],
  )
})

test('no mcp guide section documents a tool that does not exist', () => {
  const real = mcpTools()
  const documented = documentedMcpTools()
  assert.deepEqual(
    documented.filter((name) => !real.includes(name)),
    [],
  )
})

test('the mcp guide never references the scoped package name', () => {
  const source = readFileSync(MCP_DOC, 'utf8')
  assert.equal(/@caplane\/sdk/.test(source), false)
})

test('the api guide never frames /activity as a lien check', () => {
  const source = readFileSync(API_DOC, 'utf8')
  assert.equal(/(check|verify|is this).{0,40}(encumbered|taken)/i.test(source), false)
})

test('the api guide never references the scoped package name', () => {
  const source = readFileSync(API_DOC, 'utf8')
  assert.equal(/@caplane\/sdk/.test(source), false)
})
