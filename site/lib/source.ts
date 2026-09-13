import { loader } from 'fumadocs-core/source'
import { defineDocs } from 'fumadocs-mdx/macro'

const docs = defineDocs({ dir: 'content/docs' })

// Fumadocs mounts at the root of the paper tree, not under `/docs`: the proxy already routes
// `docs.caplane.xyz` to `/paper`, and a `/docs` prefix here would fight the empty-slug `page.tsx`
// that the landing plan owns for that same root.
export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
})
