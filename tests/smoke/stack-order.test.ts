import { describe, it, expect, afterAll } from 'vitest'
import {
  bringStackForward,
  bringStackToFront,
  createTextEntities,
  deleteTextEntities,
  getStackOrder,
  sendStackBackward,
  sendStackToBack,
} from './app-client'

const createdIds: string[] = []

afterAll(async () => {
  if (createdIds.length) {
    await deleteTextEntities(createdIds)
  }
})

describe('stack order routes', () => {
  it('new entities land at the top of the stack', async () => {
    const initial = await getStackOrder()
    const startLength = initial.entityOrder.length

    const result = await createTextEntities([
      { canvasX: 100, canvasY: 100, text: 'stack-a' },
      { canvasX: 200, canvasY: 200, text: 'stack-b' },
      { canvasX: 300, canvasY: 300, text: 'stack-c' },
    ])
    expect(result.ids).toHaveLength(3)
    createdIds.push(...result.ids)

    const { entityOrder } = await getStackOrder()
    expect(entityOrder.length).toBe(startLength + 3)
    // The three new ids should occupy the frontmost (last) slots.
    const tail = entityOrder.slice(-3)
    for (const id of result.ids) expect(tail).toContain(id)
  })

  it('bring-to-front moves selection to the frontmost slots', async () => {
    const [a, b, c] = createdIds
    // Start state: a, b, c are at the top (c frontmost). Move a to front.
    const result = await bringStackToFront([a])
    expect(result.changed).toBe(true)
    // a should now be the frontmost of the three; b sits behind a; c behind b.
    const order = result.entityOrder
    expect(order.indexOf(a)).toBeGreaterThan(order.indexOf(b))
    expect(order.indexOf(a)).toBeGreaterThan(order.indexOf(c))
  })

  it('send-to-back moves selection to the backmost slots', async () => {
    const [a, b, c] = createdIds
    const result = await sendStackToBack([a])
    expect(result.changed).toBe(true)
    // a should now sit behind every other id in the order.
    const order = result.entityOrder
    expect(order.indexOf(a)).toBeLessThan(order.indexOf(b))
    expect(order.indexOf(a)).toBeLessThan(order.indexOf(c))
    // a is the backmost overall.
    expect(order[0]).toBe(a)
  })

  it('bring-forward / send-backward swap neighbors', async () => {
    const [a, b] = createdIds
    // a is at the back from the previous test. Bring forward by one.
    const before = await getStackOrder()
    const aIdx = before.entityOrder.indexOf(a)

    const fwd = await bringStackForward([a])
    expect(fwd.changed).toBe(true)
    expect(fwd.entityOrder.indexOf(a)).toBe(aIdx + 1)

    const back = await sendStackBackward([a])
    expect(back.changed).toBe(true)
    expect(back.entityOrder.indexOf(a)).toBe(aIdx)

    // b is unaffected by a's swap dance.
    expect(back.entityOrder.indexOf(b)).toBe(before.entityOrder.indexOf(b))
  })

  it('mutations on non-existent ids report no change', async () => {
    const before = await getStackOrder()
    const result = await bringStackToFront(['nonexistent-id'])
    expect(result.changed).toBe(false)
    expect(result.entityOrder).toEqual(before.entityOrder)
  })
})
