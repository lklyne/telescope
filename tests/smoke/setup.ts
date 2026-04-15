import { afterEach } from 'vitest'
import { resetSmokeState } from './app-client'

afterEach(async () => {
  await resetSmokeState()
})
