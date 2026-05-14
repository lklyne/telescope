import { describe, expect, it } from 'vitest'
import { resizeGuideReferencesForHandle } from '../../src/main/runtime/resize-guide-adapter'

describe('resizeGuideReferencesForHandle', () => {
  it('uses only the dragged edge for side handles', () => {
    expect(resizeGuideReferencesForHandle('n')).toEqual(['top'])
    expect(resizeGuideReferencesForHandle('s')).toEqual(['bottom'])
    expect(resizeGuideReferencesForHandle('e')).toEqual(['right'])
    expect(resizeGuideReferencesForHandle('w')).toEqual(['left'])
  })

  it('uses only the two dragged edges for corner handles', () => {
    expect(resizeGuideReferencesForHandle('ne')).toEqual(['top', 'right'])
    expect(resizeGuideReferencesForHandle('nw')).toEqual(['top', 'left'])
    expect(resizeGuideReferencesForHandle('se')).toEqual(['bottom', 'right'])
    expect(resizeGuideReferencesForHandle('sw')).toEqual(['bottom', 'left'])
  })
})
