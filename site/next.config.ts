import path from 'node:path'
import type { NextConfig } from 'next'

// The root has to contain both the app and the linked brand package. Pointing it at the app
// directory looks tidier and breaks the build: Turbopack refuses to resolve `../brand`,
// reporting that the path "leaves the filesystem root". Pointing it at the repository is also
// what stops Next inferring a root of its own from three competing lockfiles.
const repositoryRoot = path.join(__dirname, '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@caplane/brand'],
  turbopack: { root: repositoryRoot },
  outputFileTracingRoot: repositoryRoot,
}

export default nextConfig
