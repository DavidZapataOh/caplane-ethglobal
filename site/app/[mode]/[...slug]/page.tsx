import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import { source } from '../../../lib/source'
import '../docs.css'

const MODES = ['dark', 'paper'] as const

// Mandatory (`[...slug]`, not `[[...slug]]`): an optional catch-all would collide with `page.tsx`
// on the empty slug, which that file already owns. Every non-empty doc path resolves here, in
// both modes — the dark host falls back to the same doc content, recolored by `data-mode`, rather
// than 404ing (see proxy.ts and the layout's `generateStaticParams`).
export const generateStaticParams = () => {
  const slugs = source.generateParams().map((entry) => entry.slug)
  return MODES.flatMap((mode) => slugs.map((slug) => ({ mode, slug })))
}

export const generateMetadata = async ({
  params,
}: PageProps<'/[mode]/[...slug]'>): Promise<Metadata> => {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) return {}
  return { title: page.data.title, description: page.data.description }
}

export default async function Page({ params }: PageProps<'/[mode]/[...slug]'>) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()
  const MDX = page.data.body

  return (
    <div data-docs-root className="flex-1">
      <DocsLayout tree={source.pageTree} nav={{ title: 'Caplane' }} themeSwitch={{ enabled: false }}>
        <DocsPage toc={page.data.toc} full={page.data.full}>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
          <DocsBody>
            <MDX components={{}} />
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </div>
  )
}
