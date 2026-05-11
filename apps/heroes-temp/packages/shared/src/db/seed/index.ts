import { seedBase } from './base'
import { seedDev } from './dev'
import { seedAuth } from './auth'

async function main() {
  console.log('Starting seed...\n')

  const base = await seedBase()

  const isDev = process.env.NODE_ENV !== 'production'
  if (isDev) {
    await seedDev(base)
    await seedAuth()
  }

  console.log('\nSeed complete!')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
