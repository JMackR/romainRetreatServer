// Empty stub used by lambda-build/build.mjs to replace admin-UI/SSR-only modules
// (next/cache, next/headers, next/server, …) that get statically imported via
// Payload plugin hooks (`revalidateTag`, etc.) but are never actually called
// inside the GraphQL-only subgraph Lambda. Substituting a tiny no-op module
// keeps next/* out of the bundle (saves ~200 MB) and prevents Node's ESM loader
// from refusing to start the Function with `Cannot find package 'next'`.
//
// Anything imported from here will be `undefined` (or a no-op proxy). If an
// admin code path ever does fire on Lambda we'll see a TypeError at the call
// site — easier to pin down than a missing-package crash at INIT.
const proxy = new Proxy(() => {}, {
  get: () => proxy,
  apply: () => undefined,
})
export default proxy
export const revalidateTag = () => {}
export const revalidatePath = () => {}
