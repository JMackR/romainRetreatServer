/**
 * Fail if `payload` (and @payloadcms/*) versions drift from romainRetreatCMS — same versions ⇒ same generated GraphQL.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = (s: { dependencies?: Record<string, string> }, name: string) =>
  s.dependencies?.[name] ?? s.devDependencies?.[name]

const serverP = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string> }
const cmsP = JSON.parse(
  readFileSync(resolve(process.cwd(), '../romainRetreatCMS/package.json'), 'utf8'),
) as { dependencies?: Record<string, string> }

const pairs: [string, string | undefined, string | undefined][] = [
  ['payload', root(serverP, 'payload'), root(cmsP, 'payload')],
  [
    '@payloadcms/next',
    root(serverP, '@payloadcms/next'),
    root(cmsP, '@payloadcms/next'),
  ],
  [
    '@payloadcms/richtext-lexical',
    root(serverP, '@payloadcms/richtext-lexical'),
    root(cmsP, '@payloadcms/richtext-lexical'),
  ],
  [
    '@payloadcms/db-postgres',
    root(serverP, '@payloadcms/db-postgres'),
    root(cmsP, '@payloadcms/db-postgres'),
  ],
  [
    '@payloadcms/plugin-form-builder',
    root(serverP, '@payloadcms/plugin-form-builder'),
    root(cmsP, '@payloadcms/plugin-form-builder'),
  ],
  [
    '@payloadcms/plugin-nested-docs',
    root(serverP, '@payloadcms/plugin-nested-docs'),
    root(cmsP, '@payloadcms/plugin-nested-docs'),
  ],
  [
    '@payloadcms/plugin-redirects',
    root(serverP, '@payloadcms/plugin-redirects'),
    root(cmsP, '@payloadcms/plugin-redirects'),
  ],
  [
    '@payloadcms/plugin-search',
    root(serverP, '@payloadcms/plugin-search'),
    root(cmsP, '@payloadcms/plugin-search'),
  ],
  [
    '@payloadcms/plugin-seo',
    root(serverP, '@payloadcms/plugin-seo'),
    root(cmsP, '@payloadcms/plugin-seo'),
  ],
  [
    '@payloadcms/storage-s3',
    root(serverP, '@payloadcms/storage-s3'),
    root(cmsP, '@payloadcms/storage-s3'),
  ],
]

let bad = false
for (const [name, a, b] of pairs) {
  if (a && b && a !== b) {
    console.error(`${name} mismatch: romainRetreatServer has ${a}, romainRetreatCMS has ${b}`)
    bad = true
  }
  if (a && !b) {
    console.warn(`${name} present only in server (CMS missing)`)
  }
  if (!a && b) {
    console.warn(`${name} present only in CMS (server missing)`)
  }
}
if (bad) process.exit(1)
console.log('romainRetreatServer ↔ romainRetreatCMS Payload package versions are aligned')
