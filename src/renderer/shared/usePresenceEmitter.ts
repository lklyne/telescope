import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPresenceEmitterMachine,
  type EmitterModes,
  type MachineCursorInput,
  type MachineCursorOutput,
  type PresenceEmitterMachine,
  type TransitionTable,
} from '../../shared/presence-emitter-machine'
import type { PresenceParticleControls } from './PresenceParticleTrail'

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
  outputs: MachineCursorOutput[]
  push: (inputs: ReadonlyArray<MachineCursorInputWithoutMovement>) => void
  controls: { triggerBurst: (cursorId: string) => void }
  onReady: (c: PresenceParticleControls) => void
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

  const [outputs, setOutputs] = useState<MachineCursorOutput[]>([])

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
        if (!prev) {
          isMoving = false
        } else {
          const dx = i.x - prev.x
          const dy = i.y - prev.y
          const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD_PX
          if (moved) {
            isMoving = true
            positions.set(i.cursorId, { x: i.x, y: i.y, tMs: now })
          } else {
            isMoving = now - prev.tMs < debounceMs
          }
        }
        if (!positions.has(i.cursorId)) {
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
      if (controls) {
        for (const id of bursts) controls.triggerBurst(id)
      }
      setOutputs(outputs)
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

  return { outputs, push, controls, onReady }
}
