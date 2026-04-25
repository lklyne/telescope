import type {
  EmitterModes,
  TransitionTable,
} from './presence-emitter-machine'

// Mirrors the constants that previously lived in PresenceParticleTrail.tsx +
// the default props it exposed. When renderer callers want to tweak a single
// param, spread these defaults first:
//   { ...DEFAULT_EMITTER_MODES, orbit_sphere: { ...DEFAULT_EMITTER_MODES.orbit_sphere, radiusPx: 12 } }
export const DEFAULT_EMITTER_MODES: EmitterModes = {
  trail: {
    lifetimeSeconds: 2.5,
    emitsPerFrame: 16,
    emitSpeedReferencePxPerSec: 1250,
    emitSpeedBias: 2.35,
    driftStrength: 30,
    driftReferenceDistance: 180,
    driftTurnRate: 0.7,
    driftFlowScale: 0.001,
    holdSeconds: 0.3,
    fadeOutGraceSeconds: 0.2,
    fadeOutSeconds: 1.2,
    fadeOutEasing: 'ease-in',
    baseIntensity: 1.0,
  },
  orbit_sphere: {
    radiusPx: 8,
    angularVelocityRadPerSec: 0.6,
    radiusFadeInSeconds: 0.35,
    movingRadiusScale: 0.2,
    baseIntensity: 0.15,
  },
  orbit_rect: {
    crossJitterPx: 5,
    angularVelocityRadPerSec: 0.6,
    fadeInSeconds: 0.35,
    baseIntensity: 0.12,
  },
  burst: {
    speedPxPerSec: 360,
    speedJitter: 0.25,
    lifetimeSeconds: 0.7,
    dragPerSecond: 1.8,
  },
}

// Every transition uses crossfade + burst exit by default. Edge overrides
// are empty for now; individual transitions can be retuned here as we
// dogfood the machine.
export const DEFAULT_TRANSITION_TABLE: TransitionTable = {
  default: {
    durationMs: 250,
    exitEffect: 'burst',
    easing: 'ease-in-out',
  },
  edges: {
    // Entering trail from an orbit mode: the burst is the "exhale" — no
    // second burst needed on the way in. Default already covers this; this
    // entry is a placeholder illustrating how edges override the default.
  },
}
