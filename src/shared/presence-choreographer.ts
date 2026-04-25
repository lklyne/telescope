import {
  VISUAL_STATE_FORMATION,
  type ChoreographyTransitionConfig,
  type ChoreographyTransitionTable,
  type PresenceChoreographyModes,
  type PresenceVisualStateConfig,
} from './presence-choreography-config'
import type {
  PresenceChoreographyFrame,
  PresenceChoreographyInput,
  PresenceChoreographyLayer,
  PresenceFormation,
  PresenceRect,
  PresenceVisualState,
} from './presence-visual-state'

export interface PresenceChoreographer {
  update(inputs: PresenceChoreographyInput[], dtMs: number): PresenceChoreographyFrame
}

export interface CreatePresenceChoreographerOptions {
  modes: PresenceChoreographyModes
  transitions: ChoreographyTransitionTable
  visualStates: PresenceVisualStateConfig
}

interface ActiveTransition {
  fromState: PresenceVisualState
  toState: PresenceVisualState
  elapsedMs: number
  config: ChoreographyTransitionConfig
  lockedX: number
  lockedY: number
  lockedRect: PresenceRect | null
  emittedExitEffect: boolean
}

interface CursorState {
  currentState: PresenceVisualState
  currentRect: PresenceRect | null
  transition: ActiveTransition | null
}

function applyEase(t: number, kind: ChoreographyTransitionConfig['easing']): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  switch (kind) {
    case 'ease-in':
      return t * t
    case 'ease-out':
      return 1 - (1 - t) * (1 - t)
    case 'ease-in-out':
      return t * t * (3 - 2 * t)
    default:
      return t
  }
}

function resolveTransition(
  transitions: ChoreographyTransitionTable,
  fromState: PresenceVisualState,
  toState: PresenceVisualState,
): ChoreographyTransitionConfig {
  const edge = transitions.edges?.[`${fromState}->${toState}`]
  const config = edge ?? transitions.default
  const strategy = transitions.overrideStrategy ?? config.strategy
  return {
    ...config,
    strategy,
    exitEffect: strategy === 'burst' ? 'burst' : config.exitEffect,
  }
}

function formationForState(
  state: PresenceVisualState,
  targetRect: PresenceRect | null,
): PresenceFormation {
  const formation = VISUAL_STATE_FORMATION[state]
  return formation === 'orbit_rect' && !targetRect ? 'orbit_sphere' : formation
}

function baseIntensity(
  modes: PresenceChoreographyModes,
  visualStates: PresenceVisualStateConfig,
  formation: PresenceFormation,
  visualState: PresenceVisualState,
): number {
  return modes[formation].baseIntensity * visualStates[visualState].intensityScale
}

function rectChanged(a: PresenceRect | null, b: PresenceRect | null): boolean {
  if (!a || !b) return a !== b
  return (
    a.x !== b.x ||
    a.y !== b.y ||
    a.width !== b.width ||
    a.height !== b.height
  )
}

function pushLayer(
  layers: PresenceChoreographyLayer[],
  opts: Omit<PresenceChoreographyLayer, 'transitionStrategy'> & {
    transitionStrategy: ChoreographyTransitionConfig['strategy']
  },
) {
  layers.push(opts)
}

export function createPresenceChoreographer(
  opts: CreatePresenceChoreographerOptions,
): PresenceChoreographer {
  const states = new Map<string, CursorState>()

  function startTransition(state: CursorState, input: PresenceChoreographyInput) {
    const config = resolveTransition(
      opts.transitions,
      state.currentState,
      input.visualState,
    )
    state.transition = {
      fromState: state.currentState,
      toState: input.visualState,
      elapsedMs: 0,
      config,
      lockedX: input.x,
      lockedY: input.y,
      lockedRect: state.currentRect,
      emittedExitEffect: false,
    }
  }

  function advanceState(state: CursorState, input: PresenceChoreographyInput) {
    const rectRetarget =
      state.currentState === 'inspecting' &&
      input.visualState === 'inspecting' &&
      rectChanged(state.currentRect, input.targetRect)

    if (state.transition) {
      if (input.visualState === state.transition.fromState) {
        state.transition = null
      } else if (input.visualState !== state.transition.toState) {
        state.transition.toState = input.visualState
        state.transition.config = resolveTransition(
          opts.transitions,
          state.transition.fromState,
          input.visualState,
        )
      }
    } else if (input.visualState !== state.currentState || rectRetarget) {
      startTransition(state, input)
    }
  }

  function emitLayers(
    state: CursorState,
    input: PresenceChoreographyInput,
    layers: PresenceChoreographyLayer[],
  ) {
    if (!state.transition) {
      const formation = formationForState(input.visualState, input.targetRect)
      pushLayer(layers, {
        layerId: input.cursorId,
        ownerCursorId: input.cursorId,
        x: input.x,
        y: input.y,
        color: input.color,
        formation,
        visualState: input.visualState,
        intensity: baseIntensity(opts.modes, opts.visualStates, formation, input.visualState),
        targetRect: input.targetRect,
        isMoving: input.isMoving,
        transitionProgress: 1,
        transitionStrategy: 'default',
        orbitRadiusScale: opts.visualStates[input.visualState].orbitRadiusScale,
        orbitAngularVelocityScale:
          opts.visualStates[input.visualState].orbitAngularVelocityScale,
      })
      return
    }

    const transition = state.transition
    const t = Math.min(1, transition.elapsedMs / transition.config.durationMs)
    const eased = applyEase(t, transition.config.easing)
    const fromFormation = formationForState(transition.fromState, transition.lockedRect)
    const toFormation = formationForState(transition.toState, input.targetRect)

    if (transition.config.strategy !== 'direct-morph') {
      pushLayer(layers, {
        layerId: `${input.cursorId}/leaving`,
        ownerCursorId: input.cursorId,
        x: transition.lockedX,
        y: transition.lockedY,
        color: input.color,
        formation: fromFormation,
        visualState: transition.fromState,
        intensity:
          baseIntensity(
            opts.modes,
            opts.visualStates,
            fromFormation,
            transition.fromState,
          ) *
          (1 - eased),
        targetRect: transition.lockedRect,
        isMoving: input.isMoving,
        transitionProgress: 1 - eased,
        transitionStrategy: transition.config.strategy,
        orbitRadiusScale: opts.visualStates[transition.fromState].orbitRadiusScale,
        orbitAngularVelocityScale:
          opts.visualStates[transition.fromState].orbitAngularVelocityScale,
      })
    }

    pushLayer(layers, {
      layerId:
        transition.config.strategy === 'direct-morph'
          ? input.cursorId
          : `${input.cursorId}/arriving`,
      ownerCursorId: input.cursorId,
      x: input.x,
      y: input.y,
      color: input.color,
      formation: toFormation,
      visualState: transition.toState,
      intensity:
        baseIntensity(
          opts.modes,
          opts.visualStates,
          toFormation,
          transition.toState,
        ) * eased,
      targetRect: input.targetRect,
      isMoving: input.isMoving,
      transitionProgress: eased,
      transitionStrategy: transition.config.strategy,
      orbitRadiusScale: opts.visualStates[transition.toState].orbitRadiusScale,
      orbitAngularVelocityScale:
        opts.visualStates[transition.toState].orbitAngularVelocityScale,
    })
  }

  return {
    update(inputs, dtMs) {
      const seen = new Set<string>()
      const frame: PresenceChoreographyFrame = { layers: [], events: [] }

      for (const input of inputs) {
        seen.add(input.cursorId)
        const visualState =
          input.visualState === 'inspecting' && !input.targetRect
            ? 'thinking'
            : input.visualState
        const resolvedInput = { ...input, visualState }

        let state = states.get(resolvedInput.cursorId)
        if (!state) {
          state = {
            currentState: resolvedInput.visualState,
            currentRect: resolvedInput.targetRect,
            transition: null,
          }
          states.set(resolvedInput.cursorId, state)
        }

        advanceState(state, resolvedInput)

        if (state.transition) {
          state.transition.elapsedMs += dtMs
          if (state.transition.elapsedMs >= state.transition.config.durationMs) {
            state.currentState = state.transition.toState
            state.currentRect = resolvedInput.targetRect
            state.transition = null
          } else if (
            state.transition.config.exitEffect === 'burst' &&
            !state.transition.emittedExitEffect
          ) {
            frame.events.push({
              type: 'burst',
              layerId: resolvedInput.cursorId,
              at: { x: resolvedInput.x, y: resolvedInput.y },
            })
            state.transition.emittedExitEffect = true
          }
        } else {
          state.currentState = resolvedInput.visualState
          state.currentRect = resolvedInput.targetRect
        }

        emitLayers(state, resolvedInput, frame.layers)

        for (const event of resolvedInput.events ?? []) {
          if (event.type === 'click') {
            frame.events.push({
              type: 'burst',
              layerId: state.transition
                ? state.transition.config.strategy === 'direct-morph'
                  ? resolvedInput.cursorId
                  : `${resolvedInput.cursorId}/arriving`
                : resolvedInput.cursorId,
              at: event.at,
            })
          }
        }
      }

      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id)
      }

      return frame
    },
  }
}
