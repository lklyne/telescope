import { describe, it, expect } from 'vitest'
import { getSelection, focusCamera } from './app-client'

describe('viewport', () => {
  it('returns selection state', async () => {
    const selection = await getSelection()
    // Selection is a valid object (may be empty if nothing selected)
    expect(typeof selection).toBe('object')
    expect(selection).not.toBeNull()
  })

  it('focuses camera on a region without error', async () => {
    const result = await focusCamera({
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
    })
    expect(result).toBeDefined()
  })
})
