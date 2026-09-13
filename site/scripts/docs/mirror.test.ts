import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { extractSection, mirror, mirrorSection } from './mirror.ts'

const HERE = import.meta.dirname
const README = join(HERE, '../../../README.md')
const hasLimitationsSection = existsSync(README) && /^## Limitations\n/m.test(readFileSync(README, 'utf8'))

// MDX has no HTML comment syntax, so the only transformation the mirror is allowed to make —
// `<!-- ... -->` to `{/* ... */}` — is normalized on both sides before comparing. Anything else
// diverging would be a real bug.
const toMdxComments = (text: string) => text.replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}')

// These sources haven't been written yet, so the mirrors below are expected to skip until they
// are — that's not a failure of this test.
test(
  'the threat model mirrors its source, once it exists',
  { skip: existsSync(join(HERE, '../../../THREATMODEL.md')) ? false : 'THREATMODEL.md has not been written yet' },
  () => {
    const result = mirror('../../../THREATMODEL.md', '../../content/docs/threat-model.mdx', 'Threat model')
    assert.equal(result, 'written')
    const mirrored = readFileSync(join(HERE, '../../content/docs/threat-model.mdx'), 'utf8')
    const body = mirrored.split('do not edit */}\n\n')[1]
    assert.equal(body, toMdxComments(readFileSync(join(HERE, '../../../THREATMODEL.md'), 'utf8')))
  },
)

test(
  'related work mirrors its source, once it exists',
  { skip: existsSync(join(HERE, '../../../RELATED-WORK.md')) ? false : 'RELATED-WORK.md has not been written yet' },
  () => {
    const result = mirror('../../../RELATED-WORK.md', '../../content/docs/related-work.mdx', 'Related work')
    assert.equal(result, 'written')
    const mirrored = readFileSync(join(HERE, '../../content/docs/related-work.mdx'), 'utf8')
    const body = mirrored.split('do not edit */}\n\n')[1]
    assert.equal(body, toMdxComments(readFileSync(join(HERE, '../../../RELATED-WORK.md'), 'utf8')))
  },
)

test(
  "the README's limitations section mirrors its source, once it exists",
  { skip: hasLimitationsSection ? false : "README.md has no '## Limitations' section yet" },
  () => {
    const result = mirrorSection('../../../README.md', 'Limitations', '../../content/docs/limitations.mdx', 'Limitations')
    assert.equal(result, 'written')
    const mirrored = readFileSync(join(HERE, '../../content/docs/limitations.mdx'), 'utf8')
    const body = mirrored.split('#Limitations, do not edit */}\n\n')[1]?.trimEnd()
    // Through the exported extractor, not a second copy of the regex: the copy carried the same
    // `m`-flag bug as the implementation, so it compared real content against an empty string and
    // called the mismatch a failure of the mirror.
    const source = extractSection(readFileSync(README, 'utf8'), 'Limitations')
    assert.equal(body, source === undefined ? source : toMdxComments(source))
  },
)

test('mirror reports skipped, not an error, when the source is absent', () => {
  assert.equal(mirror('../../../does-not-exist.md', '../../content/docs/does-not-exist.mdx', 'x'), 'skipped')
})

test('mirrorSection reports skipped when the source file is absent', () => {
  assert.equal(
    mirrorSection('../../../does-not-exist.md', 'Limitations', '../../content/docs/does-not-exist.mdx', 'x'),
    'skipped',
  )
})

test('mirrorSection reports skipped when the source exists but the section does not', () => {
  assert.equal(
    mirrorSection('../../../README.md', 'A Heading Nobody Wrote', '../../content/docs/does-not-exist.mdx', 'x'),
    'skipped',
  )
})

/**
 * The regression that made this whole function a no-op: with the `m` flag, `$` anchors to the end
 * of a line, so a multi-line section captured nothing and the mirrored page came out empty. It went
 * unseen because a source without the section skips, and no source had one until now.
 */
test('a section spanning several lines is captured whole, not truncated at the first newline', () => {
  const source = '# Title\n\n## Limitations\n\nFirst line.\n\n| a | b |\n|---|---|\n| c | d |\n\n## After\n\nnot this.\n'
  const result = extractSection(source, 'Limitations') ?? ''
  assert.match(result, /First line\./)
  assert.match(result, /\| c \| d \|/)
  assert.doesNotMatch(result, /not this/)
})
