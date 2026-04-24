import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  createPresenceEmitterMachine,
  type EmitterModes,
  type MachineCursorInput,
  type MachineCursorOutput,
  type PresenceEmitterMachine,
  type TransitionTable,
} from '../../shared/presence-emitter-machine'
import type {
  PresenceParticleControls,
  PresenceParticleCursor,
} from './PresenceParticleTrail'

const STATIONARY_DEBOUNCE_MS = 250
const MOVE_THRESHOLD_PX = 2

export interface UsePresenceEmitterArgs {
  modes: EmitterModes
  transitions: TransitionTable
  stationaryDebounceMs?: number
}

// Callers pass raw inputs without isMoving; the hook computes it from
// position deltas, or accepts an explicit override.
export interface MachineCursorInputWithoutMovement
  extends Omit<MachineCursorInput, 'isMoving'> {
  isMoving?: boolean
}

export interface UsePresenceEmitterResult {
  push: (inputs: ReadonlyArray<MachineCursorInputWithoutMovement>) => void
  controls: { triggerBurst: (cursorId: string) => void }
  onReady: (c: PresenceParticleControls) => void
}

function toParticleCursor(o: MachineCursorOutput): PresenceParticleCursor {
  return {
    id: o.id,
    x: o.x,
    y: o.y,
    color: o.color,
    intensity: o.intensity,
    emitterMode: o.mode,
    targetRect: o.targetRect,
  }
}

export function usePresenceEmitter(
  args: UsePresenceEmitterArgs,
): UsePresenceEmitterResult {
  const machineRef = useRef<PresenceEmitterMachine | null>(null)
  if (!machineRef.current) {
    machineRef.current = createPresenceEmitterMachine({
      modes: args.modes,
      transitions: args.transitions,
    })
  }

  const lastPosRef = useRef<Map<string, { x: number; y: number; tMs: number }>>(
    new Map(),
  )
  const particleControlsRef = useRef<PresenceParticleControls | null>(null)
  const lastTickMsRef = useRef<number>(performance.now())
  const debounceMs = args.stationaryDebounceMs ?? STATIONARY_DEBOUNCE_MS

  // push() runs per caller tick. It mutates refs and calls into the particle
  // system imperatively — no React state is set here, so the caller tree
  // does not re-render on each RAF even though this fires ~60 times/sec.
  const push = useCallback(
    (inputs: ReadonlyArray<MachineCursorInputWithoutMovement>) => {
      const now = performance.now()
      const dtMs = now - lastTickMsRef.current
      lastTickMsRef.current = now

      const positions = lastPosRef.current
      const resolved: MachineCursorInput[] = inputs.map((i) => {
        if (typeof i.isMoving === 'boolean') {
          positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
          return { ...i, isMoving: i.isMoving } as MachineCursorInput
        }
        const prev = positions.get(i.cursorId)
        let isMoving = false
        if (prev) {
          const dx = i.x - prev.x
          const dy = i.y - prev.y
          const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD_PX
          if (moved) {
            isMoving = true
            positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
          } else {
            isMoving = now - prev.tMs < debounceMs
          }
        } else {
          positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
        }
        return { ...i, isMoving } as MachineCursorInput
      })

      // Prune positions for cursors that disappeared.
      const seen = new Set(resolved.map((r) => r.cursorId))
      for (const id of positions.keys()) {
        if (!seen.has(id)) positions.delete(id)
      }

      const { outputs, bursts } = machineRef.current!.flush(resolved, dtMs)
      const controls = particleControlsRef.current
      if (!controls) return
      controls.pushCursors(outputs.map(toParticleCursor))
      for (const id of bursts) controls.triggerBurst(id)
    },
    [debounceMs],
  )

  const controls = useMemo(
    () => ({
      triggerBurst: (cursorId: string) => {
        machineRef.current!.triggerBurst(cursorId)
      },
    }),
    [],
  )

  const onReady = useCallback((c: PresenceParticleControls) => {
    particleControlsRef.current = c
  }, [])

  useEffect(() => {
    // Reset lastTick on mount so the first push's dtMs is small.
    lastTickMsRef.current = performance.now()
  }, [])

  return { push, controls, onReady }
}
