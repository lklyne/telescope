import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  createPresenceChoreographer,
  type PresenceChoreographer,
} from '../../shared/presence-choreographer'
import type {
  ChoreographyTransitionTable,
  PresenceChoreographyModes,
  PresenceVisualStateConfig,
} from '../../shared/presence-choreography-config'
import type {
  PresenceChoreographyInput,
  PresenceChoreographyLayer,
  PresenceVisualEvent,
} from '../../shared/presence-visual-state'
import type {
  PresenceParticleControls,
  PresenceParticleCursor,
} from './PresenceParticleTrail'

const STATIONARY_DEBOUNCE_MS = 250
const MOVE_THRESHOLD_PX = 2

export interface UsePresenceChoreographyArgs {
  modes: PresenceChoreographyModes
  transitions: ChoreographyTransitionTable
  visualStates: PresenceVisualStateConfig
  stationaryDebounceMs?: number
}

export interface PresenceChoreographyInputWithoutMovement
  extends Omit<PresenceChoreographyInput, 'isMoving' | 'events'> {
  isMoving?: boolean
}

export interface UsePresenceChoreographyResult {
  push: (inputs: ReadonlyArray<PresenceChoreographyInputWithoutMovement>) => void
  controls: { triggerEvent: (cursorId: string, event: PresenceVisualEvent) => void }
  onReady: (c: PresenceParticleControls) => void
}

function toParticleCursor(layer: PresenceChoreographyLayer): PresenceParticleCursor {
  return {
    id: layer.layerId,
    x: layer.x,
    y: layer.y,
    color: layer.color,
    intensity: layer.intensity,
    emitterMode: layer.formation,
    targetRect: layer.targetRect,
    isMoving: layer.isMoving,
    orbitRadiusScale: layer.orbitRadiusScale,
    orbitAngularVelocityScale: layer.orbitAngularVelocityScale,
  }
}

export function usePresenceChoreography(
  args: UsePresenceChoreographyArgs,
): UsePresenceChoreographyResult {
  const choreographerRef = useRef<PresenceChoreographer | null>(null)
  if (!choreographerRef.current) {
    choreographerRef.current = createPresenceChoreographer({
      modes: args.modes,
      transitions: args.transitions,
      visualStates: args.visualStates,
    })
  }
  useEffect(() => {
    choreographerRef.current = createPresenceChoreographer({
      modes: args.modes,
      transitions: args.transitions,
      visualStates: args.visualStates,
    })
  }, [args.modes, args.transitions, args.visualStates])

  const lastPosRef = useRef<Map<string, { x: number; y: number; tMs: number }>>(
    new Map(),
  )
  const particleControlsRef = useRef<PresenceParticleControls | null>(null)
  const pendingInputsRef = useRef<
    ReadonlyArray<PresenceChoreographyInputWithoutMovement>
  >([])
  const pendingEventsRef = useRef<Map<string, PresenceVisualEvent[]>>(new Map())
  const debounceMs = args.stationaryDebounceMs ?? STATIONARY_DEBOUNCE_MS

  const push = useCallback(
    (inputs: ReadonlyArray<PresenceChoreographyInputWithoutMovement>) => {
      pendingInputsRef.current = inputs
    },
    [],
  )

  const controls = useMemo(
    () => ({
      triggerEvent: (cursorId: string, event: PresenceVisualEvent) => {
        const events = pendingEventsRef.current.get(cursorId) ?? []
        events.push(event)
        pendingEventsRef.current.set(cursorId, events)
      },
    }),
    [],
  )

  const onReady = useCallback((c: PresenceParticleControls) => {
    particleControlsRef.current = c
  }, [])

  useEffect(() => {
    let rafId = 0
    let lastTickMs = performance.now()

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)
      const controls = particleControlsRef.current
      if (!controls) {
        lastTickMs = now
        return
      }
      const dtMs = now - lastTickMs
      lastTickMs = now

      const positions = lastPosRef.current
      const events = pendingEventsRef.current
      const resolved: PresenceChoreographyInput[] = pendingInputsRef.current.map(
        (input) => {
          let isMoving = input.isMoving
          if (typeof isMoving === 'boolean') {
            positions.set(input.cursorId, { x: input.x, y: input.y, tMs: now })
          } else {
            const prev = positions.get(input.cursorId)
            isMoving = false
            if (prev) {
              const dx = input.x - prev.x
              const dy = input.y - prev.y
              const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD_PX
              if (moved) {
                isMoving = true
                positions.set(input.cursorId, { x: input.x, y: input.y, tMs: now })
              } else {
                isMoving = now - prev.tMs < debounceMs
              }
            } else {
              positions.set(input.cursorId, { x: input.x, y: input.y, tMs: now })
            }
          }
          const inputEvents = events.get(input.cursorId) ?? []
          events.delete(input.cursorId)
          return { ...input, isMoving, events: inputEvents }
        },
      )

      const seen = new Set(resolved.map((r) => r.cursorId))
      for (const id of positions.keys()) {
        if (!seen.has(id)) positions.delete(id)
      }

      const frame = choreographerRef.current!.update(resolved, dtMs)
      controls.pushCursors(frame.layers.map(toParticleCursor))
      for (const event of frame.events) controls.triggerBurst(event.layerId)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [debounceMs])

  return { push, controls, onReady }
}
