#!/usr/bin/env node
/**
 * The sprite is the source of truth for shape; the component is derived from it. Running this
 * after editing sprite.svg is what keeps the two representations from drifting — and the test
 * that compares their name lists is what catches it when someone forgets.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync(new URL('../sprite.svg', import.meta.url), 'utf8')
const symbols = [...svg.matchAll(/<symbol id="i-([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)]

const icons = symbols.map(([, name, body]) => [
  name,
  [...body.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]),
])

const lines = [
  '// Generated from sprite.svg by tools/from-sprite.mjs. Edit the sprite, not this file.',
  '',
  '// Deliberately unannotated: a Record<string, string[]> annotation would make this an index',
  '// signature, and noUncheckedIndexedAccess then widens every lookup to `| undefined`.',
  'export const ICON_PATHS = {',
  ...icons.map(([name, paths]) => `  ${JSON.stringify(name)}: [${paths.map((d) => JSON.stringify(d)).join(', ')}],`),
  '}',
  '',
  'export const ICON_NAMES = /** @type {IconName[]} */ (Object.keys(ICON_PATHS))',
  '',
  '/** @typedef {keyof typeof ICON_PATHS} IconName */',
  '',
]
writeFileSync(new URL('../icon-names.js', import.meta.url), lines.join('\n'))
console.log(`${icons.length} icons written`)
