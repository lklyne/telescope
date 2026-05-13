import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  applyLayoutDirective,
  createPages,
  deletePages,
  getWorkspace,
} from './app-client'
import { assertPersists, assertUndoable } from './test-utils'

const trash: string[] = []

afterAll(async () => {
  if (trash.length) await deletePages(trash)
})

describe('layout directive — pure-create row', () => {
  it('lays new items out at an explicit origin', async () => {
    const items = [
      { width: 200, height: 100 },
      { width: 200, height: 100 },
      { width: 200, height: 100 },
    ]
    const result = await applyLayoutDirective({
      layout: { kind: 'row', gap: 'xs', originX: 0, originY: 0 },
      items,
    })
    expect(result.positions).toEqual([
      { canvasX: 0, canvasY: 0 },
      { canvasX: 220, canvasY: 0 },
      { canvasX: 440, canvasY: 0 },
    ])
    expect(result.kinds).toEqual([null, null, null])
  })

  it('honors spacing tokens precisely (no snap-to-grid)', async () => {
    const result = await applyLayoutDirective({
      layout: { kind: 'row', gap: 'm', originX: 100, originY: 100 },
      items: [
        { width: 100, height: 100 },
        { width: 100, height: 100 },
      ],
    })
    // m = 60px
    expect(result.positions[1].canvasX - result.positions[0].canvasX).toBe(160)
  })

  it('treats per-item dimensions as outer footprints and offsets positions by insets', async () => {
    // Simulated iPad Pro 11 landscape: 1194x834 inner + 24px shell insets on
    // all sides. Outer footprint = 1242 x 882, insetX = insetY = 24.
    const result = await applyLayoutDirective({
      layout: { kind: 'row', gap: 'm', originX: 100, originY: 200 },
      items: [
        { width: 1242, height: 882, insetX: 24, insetY: 24 },
        { width: 1242, height: 882, insetX: 24, insetY: 24 },
      ],
    })
    // First item's inner top-left lands at the user-supplied origin.
    expect(result.positions[0]).toEqual({ canvasX: 100, canvasY: 200 })
    // Second item: outer-step = outerWidth + gap = 1242 + 60 = 1302. Adding
    // insetX back to convert outer→inner cancels with the origin shift, so
    // the visible whitespace between bezels is exactly the requested gap.
    expect(result.positions[1].canvasX - result.positions[0].canvasX).toBe(1302)
    expect(result.positions[1].canvasY).toBe(200)
  })

  it('treats items without insets as un-framed (insets default to 0)', async () => {
    const result = await applyLayoutDirective({
      layout: { kind: 'row', gap: 'xs', originX: 0, originY: 0 },
      items: [
        { width: 200, height: 100 },
        { width: 200, height: 100 },
      ],
    })
    expect(result.positions).toEqual([
      { canvasX: 0, canvasY: 0 },
      { canvasX: 220, canvasY: 0 },
    ])
  })
})

describe('layout directive — re-layout existing entities', () => {
  it('reorganizes existing pages into a 2-col grid and fills in kinds', async () => {
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = await createPages([
        { url: `data:text/html,<div>${i}</div>`, canvasX: i * 500, canvasY: i * 300, presetIndex: 9 },
      ])
      ids.push(...r.pageIds)
    }
    trash.push(...ids)
    const created = { pageIds: ids }

    const ws = await getWorkspace()
    const pageIds = ws.entities.filter((e) => e.kind === 'page').map((e) => e.id)
    expect(pageIds).toEqual(expect.arrayContaining(created.pageIds))

    const result = await applyLayoutDirective({
      layout: { kind: 'grid', cols: 2, gap: 24, originX: 0, originY: 0 },
      items: created.pageIds.map((id) => ({ id })),
    })

    expect(result.kinds).toEqual(['page', 'page', 'page', 'page'])
    // 2-col grid with uniform tracks. Same-size pages → predictable cells.
    const rowDelta = result.positions[2].canvasY - result.positions[0].canvasY
    const colDelta = result.positions[1].canvasX - result.positions[0].canvasX
    expect(colDelta).toBeGreaterThan(0)
    expect(rowDelta).toBeGreaterThan(0)
    expect(result.positions[3].canvasX).toBe(result.positions[1].canvasX)
    expect(result.positions[3].canvasY).toBe(result.positions[2].canvasY)
  })

  it('errors on unknown id without partial application', async () => {
    await expect(
      applyLayoutDirective({
        layout: { kind: 'row', gap: 16, originX: 0, originY: 0 },
        items: [{ id: 'page_does_not_exist_xyz' }],
      }),
    ).rejects.toThrow()
  })

  it('uses bbox of existing items as implicit origin when no anchor given', async () => {
    const ids: string[] = []
    for (let i = 0; i < 2; i++) {
      const r = await createPages([
        { url: `data:text/html,<div>${i}</div>`, canvasX: 500 + i * 1000, canvasY: 400 + i * 400, presetIndex: 9 },
      ])
      ids.push(...r.pageIds)
    }
    trash.push(...ids)
    const created = { pageIds: ids }

    const result = await applyLayoutDirective({
      layout: { kind: 'row', gap: 'xs' },
      items: created.pageIds.map((id) => ({ id })),
    })

    // Implicit origin = (min x, min y) of bbox = (500, 400). No snap.
    expect(result.positions[0].canvasX).toBe(500)
    expect(result.positions[0].canvasY).toBe(400)
  })
})

describe('layout directive — lifecycle', () => {
  const lifecyclePageIds: string[] = []

  afterEach(async () => {
    if (lifecyclePageIds.length) {
      await deletePages(lifecyclePageIds.splice(0))
    }
  })

  it('persists pages produced by a layout directive to disk', async () => {
    // applyLayoutDirective computes positions but doesn't create entities;
    // the setup creates the pages and the layout chooses where they land.
    await assertPersists(async () => {
      const result = await applyLayoutDirective({
        layout: { kind: 'row', gap: 16, originX: 1200, originY: 1200 },
        items: [
          { width: 200, height: 200 },
          { width: 200, height: 200 },
        ],
      })
      const created = await createPages(
        result.positions.map((p, i) => ({
          url: `data:text/html,<div>persist-${i}</div>`,
          canvasX: p.canvasX,
          canvasY: p.canvasY,
          presetIndex: 9,
        })),
      )
      lifecyclePageIds.push(...created.pageIds)
    })
  })

  it('round-trips a single layout-placed page through undo/redo', async () => {
    await assertUndoable(async () => {
      const result = await applyLayoutDirective({
        layout: { kind: 'row', gap: 16, originX: 1600, originY: 1600 },
        items: [{ width: 200, height: 200 }],
      })
      const created = await createPages([
        {
          url: 'data:text/html,<div>undo-layout</div>',
          canvasX: result.positions[0].canvasX,
          canvasY: result.positions[0].canvasY,
          presetIndex: 9,
        },
      ])
      lifecyclePageIds.push(...created.pageIds)
    })
  })
})
