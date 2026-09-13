import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '../../../lib/source'

// The only server route in `site/`. `staticGET` resolves the search index once at build time;
// `revalidate = false` keeps Vercel serving that fixed response, never recomputing per request.
export const revalidate = false
export const { staticGET: GET } = createFromSource(source)
