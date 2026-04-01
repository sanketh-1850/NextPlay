import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const candidates = ['go', 'C:\\Program Files\\Go\\bin\\go.exe']

for (const candidate of candidates) {
  const result = spawnSync(candidate, args, {
    stdio: 'inherit',
    shell: false,
  })

  if (!result.error) {
    process.exit(result.status ?? 0)
  }
}

console.error('Unable to locate the Go toolchain. Checked go and C:\\Program Files\\Go\\bin\\go.exe.')
process.exit(1)
