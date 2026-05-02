// esbuild driver for `make build-SubgraphFunction` (template.yaml's makefile builder).
// Bundles subgraphs/_shared/lambda.ts → $ARTIFACTS_DIR/lambda.mjs.
//
// Three categories of dependency, all surfaced as esbuild `external` so they don't
// get inlined into the bundle (each for a different reason):
//
//   NPM_INSTALL — the Makefile npm-installs these into ARTIFACTS_DIR/node_modules.
//     Just `sharp`: native libvips bindings, can't be bundled.
//
//   STUB_AT_BUNDLE — replaced with `empty.mjs` via an onResolve plugin. These are
//     admin-UI / Next-ISR modules that Payload plugins import statically (e.g.
//     `import { revalidateTag } from 'next/cache'`) but never call on a GraphQL
//     Lambda. Without stubbing, Node ESM resolution crashes at INIT with
//     `Cannot find package 'next'`.
//
//   STUB_AT_RUNTIME — left as bare imports/requires that fail only if invoked.
//     `@opentelemetry/api` is reached only by Next's tracer hook inside try/catch.
import { build } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR
if (!ARTIFACTS_DIR) {
  console.error('ARTIFACTS_DIR not set — invoke via `yarn sam:build`')
  process.exit(1)
}

const stubPath = resolve(__dirname, 'empty.mjs')

const NPM_INSTALL_EXTERNALS = ['sharp']
const STUB_AT_RUNTIME_EXTERNALS = ['@opentelemetry/api']
// Match `next` and any deep import (`next/cache`, `next/headers`, …). Add other
// admin-only top-level packages to this list as new ones leak in.
const STUB_AT_BUNDLE_PATTERNS = [/^next($|\/)/]

await build({
  entryPoints: ['subgraphs/_shared/lambda.ts'],
  outfile: `${ARTIFACTS_DIR}/lambda.mjs`,
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'esm',
  sourcemap: true,
  // Without OutExtension'ing or naming the outfile .mjs, nodejs22.x refuses ESM
  // because /var/task has no package.json `"type":"module"`.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  external: [...NPM_INSTALL_EXTERNALS, ...STUB_AT_RUNTIME_EXTERNALS],
  logLevel: 'info',
  plugins: [
    {
      name: 'stub-admin-only-modules',
      setup(b) {
        for (const pattern of STUB_AT_BUNDLE_PATTERNS) {
          b.onResolve({ filter: pattern }, () => ({ path: stubPath }))
        }
      },
    },
  ],
})
