import { describe, expect, it } from 'vitest'
import {
  partitionSidebar,
  type PartitionLeaf,
  type PartitionGroup,
} from '../../src/shared/sidebar-partition'

describe('partitionSidebar', () => {
  it('splits top-level leaves by surface', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'note1', surface: 'notes' },
      { id: 'page1', surface: 'pages' },
      { id: 'note2', surface: 'notes' },
    ]
    const result = partitionSidebar(leaves, [], ['note1', 'page1', 'note2'])
    expect(result.notes.map((n) => n.id)).toEqual(['note2', 'note1'])
    expect(result.pages.map((n) => n.id)).toEqual(['page1'])
  })

  it('orders each section frontmost-first by entityOrder', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'a', surface: 'notes' },
      { id: 'b', surface: 'notes' },
      { id: 'c', surface: 'notes' },
    ]
    // entityOrder is back-to-front; 'c' is frontmost, so it should sit at the top.
    const result = partitionSidebar(leaves, [], ['a', 'b', 'c'])
    expect(result.notes.map((n) => n.id)).toEqual(['c', 'b', 'a'])
  })

  it('pure-notes groups appear only in Notes', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'n1', surface: 'notes', parentGroupId: 'g' },
      { id: 'n2', surface: 'notes', parentGroupId: 'g' },
    ]
    const groups: PartitionGroup[] = [{ id: 'g' }]
    const result = partitionSidebar(leaves, groups, ['n1', 'n2', 'g'])
    expect(result.notes.map((n) => n.id)).toEqual(['g'])
    expect(result.pages).toHaveLength(0)
  })

  it('pure-pages groups appear only in Pages', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'p1', surface: 'pages', parentGroupId: 'g' },
      { id: 'p2', surface: 'pages', parentGroupId: 'g' },
    ]
    const result = partitionSidebar(leaves, [{ id: 'g' }], ['p1', 'p2', 'g'])
    expect(result.pages.map((n) => n.id)).toEqual(['g'])
    expect(result.notes).toHaveLength(0)
  })

  it('mixed groups emit a linked row in each section, sharing the same id', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'note', surface: 'notes', parentGroupId: 'g' },
      { id: 'page', surface: 'pages', parentGroupId: 'g' },
    ]
    const result = partitionSidebar(leaves, [{ id: 'g' }], ['note', 'page', 'g'])
    expect(result.notes.map((n) => n.id)).toEqual(['g'])
    expect(result.pages.map((n) => n.id)).toEqual(['g'])
    // Each section shows only its surface's children:
    expect(result.notes[0]!.children.map((c) => c.id)).toEqual(['note'])
    expect(result.pages[0]!.children.map((c) => c.id)).toEqual(['page'])
  })

  it('mixed group children are filtered by section surface', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'note1', surface: 'notes', parentGroupId: 'g' },
      { id: 'note2', surface: 'notes', parentGroupId: 'g' },
      { id: 'page1', surface: 'pages', parentGroupId: 'g' },
    ]
    const result = partitionSidebar(leaves, [{ id: 'g' }], ['note1', 'page1', 'note2', 'g'])
    expect(result.notes[0]!.children.map((c) => c.id)).toEqual(['note2', 'note1'])
    expect(result.pages[0]!.children.map((c) => c.id)).toEqual(['page1'])
  })

  it('nested groups: child group with matching surface only', () => {
    // Outer mixed group contains an inner pure-notes group (with notes) and a page.
    const leaves: PartitionLeaf[] = [
      { id: 'inner-note', surface: 'notes', parentGroupId: 'inner' },
      { id: 'outer-page', surface: 'pages', parentGroupId: 'outer' },
    ]
    const groups: PartitionGroup[] = [
      { id: 'inner', parentGroupId: 'outer' },
      { id: 'outer' },
    ]
    const result = partitionSidebar(
      leaves,
      groups,
      ['inner-note', 'outer-page', 'inner', 'outer'],
    )
    // Outer in both sections (mixed):
    expect(result.notes.map((n) => n.id)).toEqual(['outer'])
    expect(result.pages.map((n) => n.id)).toEqual(['outer'])
    // Notes-section outer shows the inner group; Pages-section outer does not
    // (inner has no page descendants).
    expect(result.notes[0]!.children.map((c) => c.id)).toEqual(['inner'])
    expect(result.notes[0]!.children[0]!.children.map((c) => c.id)).toEqual(['inner-note'])
    expect(result.pages[0]!.children.map((c) => c.id)).toEqual(['outer-page'])
  })

  it('surfaceLeafCount counts only this section\'s surface', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'n1', surface: 'notes', parentGroupId: 'g' },
      { id: 'n2', surface: 'notes', parentGroupId: 'g' },
      { id: 'p1', surface: 'pages', parentGroupId: 'g' },
    ]
    const result = partitionSidebar(leaves, [{ id: 'g' }], ['n1', 'n2', 'p1', 'g'])
    expect(result.notes[0]!.surfaceLeafCount).toBe(2)
    expect(result.pages[0]!.surfaceLeafCount).toBe(1)
  })

  it('ids missing from entityOrder fall to the back, preserving input order', () => {
    const leaves: PartitionLeaf[] = [
      { id: 'a', surface: 'notes' },
      { id: 'b', surface: 'notes' },
      { id: 'c', surface: 'notes' },
    ]
    // Only 'b' is in entityOrder. 'a' and 'c' tie at rank -1; original order wins.
    const result = partitionSidebar(leaves, [], ['b'])
    expect(result.notes.map((n) => n.id)).toEqual(['b', 'a', 'c'])
  })
})
