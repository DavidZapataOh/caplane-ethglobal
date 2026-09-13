import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import { Landing } from '../../components/landing'
import { source } from '../../lib/source'
import './docs.css'

// The `dark` branch keeps the root layout's metadata (returning `{}` leaves it untouched); only
// `paper` has a real doc page whose frontmatter should replace it.
export const generateMetadata = async ({ params }: PageProps<'/[mode]'>): Promise<Metadata> => {
  const { mode } = await params
  if (mode !== 'paper') return {}
  const page = source.getPage([])
  if (!page) return {}
  return { title: page.data.title, description: page.data.description }
}

export default async function Page({ params }: PageProps<'/[mode]'>) {
  const { mode } = await params

  if (mode === 'paper') {
    const page = source.getPage([])
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

  return <Landing />
}
