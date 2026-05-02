import 'dotenv/config'

import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Overlay `.env.local` (Next.js-style) so the same file works as in the client apps. Optional file.
const envLocal = resolve(process.cwd(), '.env.local')
if (existsSync(envLocal)) {
  config({ path: envLocal, override: true })
}
