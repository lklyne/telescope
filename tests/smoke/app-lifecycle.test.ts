import { describe, it, expect } from 'vitest'
import { getHealth, getWorkspace } from './app-client'

describe('app lifecycle', () => {
  it('responds to health check', async () => {
    const health = await getHealth()
    expect(health.version).toBe('1')
  })

  it('returns a valid workspace graph', async () => {
    const workspace = await getWorkspace()
    expect(workspace).toHaveProperty('entities')
    expect(workspace).toHaveProperty('camera')
    expect(Array.isArray(workspace.entities)).toBe(true)
  })
})
