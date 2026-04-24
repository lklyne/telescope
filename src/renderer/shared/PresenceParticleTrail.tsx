// @ts-nocheck — TSL node types are intentionally loose.

import { useEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import {
  Fn,
  If,
  float,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  mx_noise_vec3,
  positionLocal,
  smoothstep,
  uint,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

const MAX_POOL_SIZE = 8192
const MAX_CURSORS = 8
// Hardcoded dispatch ceiling. The actual emits-per-frame is a runtime uniform
// and may be anything in [2, EMIT_PER_FRAME_MAX].
const EMIT_PER_FRAME_MAX = 16

// Per-particle behavior mode, stored in stateBuffer.z. The sim kernel dispatches
// on this so orbit/burst particles share the same pool and render path as trail.
// Keep in sync with any shader-side constants below.
const PARTICLE_MODE_TRAIL = 0
const PARTICLE_MODE_ORBIT_SPHERE = 1
const PARTICLE_MODE_ORBIT_RECT = 2
const PARTICLE_MODE_BURST = 3

// Orbit sphere tuning defaults. These are used as the fallback when the
// corresponding props are not supplied. See Props for the prop names.
const ORBIT_SPHERE_RADIUS_PX = 8
const ORBIT_SPHERE_ANGULAR_VELOCITY = 0.6
const ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS = 0.35
// Spring-constant (px/s² per px of displacement). At intensity=1, this pulls
// orbit particles tightly to their sphere target; at intensity=0, no pull,
// particles drift on inertia.
const ORBIT_SPHERE_CONSTRAINT_STRENGTH = 120
// Velocity damping (per second). Keeps released particles from drifting forever.
const ORBIT_SPHERE_DAMPING_PER_SECOND = 1.4
// Extra outward push (px/s) applied when intensity < 1, scaled by (1-intensity).
// This is what makes the ball visibly "disperse" rather than just stop pulling.
const ORBIT_SPHERE_DISPERSAL_SPEED = 45

// Orbit rect tuning defaults.
const ORBIT_RECT_CROSS_JITTER_PX = 5
const ORBIT_RECT_FADE_IN_SECONDS = 0.35

// Burst tuning defaults.
const BURST_SPEED_PX_PER_SEC = 360
const BURST_SPEED_JITTER = 0.25 // ± fraction of base speed
const BURST_LIFETIME_SECONDS = 0.7
const BURST_DRAG_PER_SECOND = 1.8

// Spawn threshold multiplier for orbit cursors. Tuned so the sphere holds
// ~300 particles in flight at the default 2.5s lifetime — dense enough to
// read as a shell without flooding the pool. Exported so callers (production
// layer + debug playground) agree on density without each picking their own.
export const ORBIT_SPHERE_INTENSITY = 0.15
// Rect perimeters are larger than the sphere shell, so a lower per-slot
// probability still fills the ring adequately.
export const ORBIT_RECT_INTENSITY = 0.12

function hashStringToUnit(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 0) / 0xffffffff
}

// Screen-space offset from the cursor's translate origin to the particle
// emission point — below-and-right of the arrow body, so both trail and
// orbit_sphere sit clearly off the icon rather than emerging from it.
// orbit_rect ignores this (it uses targetRect directly). Shared by
// AgentCursorLayer (production) and PresencePlayground (debug defaults).
export const CURSOR_TRAIL_OFFSET = { x: 24, y: 24 } as const

export type PresenceParticleEmitterMode =
  | 'trail'
  | 'orbit_sphere'
  | 'orbit_rect'

export interface PresenceParticleTargetRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PresenceParticleCursor {
  id: string
  x: number
  y: number
  color: string
  intensity: number
  /** Defaults to 'trail' when omitted to preserve existing callers. */
  emitterMode?: PresenceParticleEmitterMode
  /**
   * Required for emitterMode='orbit_rect'. Screen-space bounds in the same
   * coordinate frame as (x, y). Ignored by other modes.
   */
  targetRect?: PresenceParticleTargetRect | null
}

interface Props {
  /**
   * Initial cursor list. Callers that use the imperative `pushCursors` on the
   * `onReady` controls (e.g. usePresenceEmitter) can omit this — empty array
   * is fine since per-frame updates come through the imperative path.
   */
  cursors?: PresenceParticleCursor[]
  holdSeconds?: number
  lifetimeSeconds?: number
  size?: number
  /** Peak px/s of random drift (reached when particle is >= referenceDistance from cursor). */
  driftStrength?: number
  /** Distance in px at which drift smoothstep-eases up to max. */
  driftReferenceDistance?: number
  /** How fast each particle's drift direction evolves over time. 0 = fixed direction; larger = more swirling. */
  driftTurnRate?: number
  /** Spatial coherence of the drift flow field. 0 = every particle independent; higher = neighbors drift together. */
  driftFlowScale?: number
  /** Active slots in the ring buffer; clamped to [64, MAX_POOL_SIZE]. */
  particleCount?: number
  /** Seconds a cursor must sit idle (intensity <= 0) before its trail starts a global fade. */
  fadeOutGraceSeconds?: number
  /** Duration of the global fade from full to invisible, in seconds. */
  fadeOutSeconds?: number
  /** Easing curve applied to the global fade. */
  fadeOutEasing?: FadeEasing
  /** Cursor speed (px/s) at which emission reaches full rate. */
  emitSpeedReferencePxPerSec?: number
  /** Power curve on the speed→emit mapping. >1 biases emission to the fast middle. */
  emitSpeedBias?: number
  /** Max particles spawned per cursor per frame. Clamped to [2, 16]. */
  emitsPerFrame?: number
  /** Orbit sphere tuning. Defaults match the existing constants. */
  orbitSphereRadiusPx?: number
  orbitSphereAngularVelocityRadPerSec?: number
  orbitSphereRadiusFadeInSeconds?: number
  /** Spring k (px/s² per px). Scales with cursor intensity so particles stay
   * tight when in orbit and coast outward when intensity drops. */
  orbitSphereConstraintStrength?: number
  /** Velocity damping per second for orbit particles. */
  orbitSphereDampingPerSecond?: number
  /** Outward dispersal speed (px/s) at intensity=0. Makes the ball actively
   * disperse during a transition-out rather than just drift stale. */
  orbitSphereDispersalSpeedPxPerSec?: number
  /** Orbit rect tuning. */
  orbitRectCrossJitterPx?: number
  orbitRectAngularVelocityRadPerSec?: number
  orbitRectFadeInSeconds?: number
  /** Burst (click transient) tuning. */
  burstSpeedPxPerSec?: number
  burstSpeedJitter?: number
  burstLifetimeSeconds?: number
  burstDragPerSecond?: number
  /**
   * Fires once after the WebGPU system is initialized. Callers can capture
   * the returned controls (e.g. triggerBurst) into a ref and call them in
   * response to cursor events. The function is stable for the lifetime of
   * the mount.
   */
  onReady?: (controls: PresenceParticleControls) => void
}

export interface PresenceParticleControls {
  /**
   * Imperatively sync the cursor list. Lets callers (e.g. usePresenceEmitter)
   * push per-frame updates without round-tripping through React state — the
   * component never has to re-render when cursor positions or modes change.
   */
  pushCursors: (cursors: PresenceParticleCursor[]) => void
  /**
   * Convert the given cursor's orbit particles into a radial burst. No-op
   * if the id isn't currently in the cursor list.
   */
  triggerBurst: (cursorId: string) => void
}

type FadeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

function applyEase(t: number, kind: FadeEasing): number {
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

interface Handle {
  pushCursors: (cursors: PresenceParticleCursor[]) => void
  /**
   * Convert this cursor's existing orbit particles into a radial burst and
   * reset their age so the burst fade-out curve starts fresh. No-op if the
   * cursor id isn't currently tracked.
   */
  triggerBurst: (cursorId: string) => void
  setParams: (p: {
    holdSeconds: number
    lifetimeSeconds: number
    size: number
    driftStrength: number
    driftReferenceDistance: number
    driftTurnRate: number
    driftFlowScale: number
    particleCount: number
    fadeOutGraceSeconds: number
    fadeOutSeconds: number
    fadeOutEasing: FadeEasing
    emitSpeedReferencePxPerSec: number
    emitSpeedBias: number
    emitsPerFrame: number
  }) => void
}

function buildSystem(initial: {
  holdSeconds: number
  lifetimeSeconds: number
  size: number
  driftStrength: number
  driftReferenceDistance: number
  driftTurnRate: number
  driftFlowScale: number
  particleCount: number
  fadeOutGraceSeconds: number
  fadeOutSeconds: number
  fadeOutEasing: FadeEasing
  emitSpeedReferencePxPerSec: number
  emitSpeedBias: number
  emitsPerFrame: number
  orbitSphereRadiusPx: number
  orbitSphereAngularVelocity: number
  orbitSphereRadiusFadeInSeconds: number
  orbitSphereConstraintStrength: number
  orbitSphereDampingPerSecond: number
  orbitSphereDispersalSpeedPxPerSec: number
  orbitRectCrossJitterPx: number
  orbitRectAngularVelocity: number
  orbitRectFadeInSeconds: number
  burstSpeedPxPerSec: number
  burstSpeedJitter: number
  burstLifetimeSeconds: number
  burstDragPerSecond: number
}) {
  const positionBuffer = instancedArray(MAX_POOL_SIZE, 'vec3') // (x, y, z)
  const stateBuffer = instancedArray(MAX_POOL_SIZE, 'vec3')    // (age, cursorIdx, mode)
  const velocityBuffer = instancedArray(MAX_POOL_SIZE, 'vec3') // (vx, vy, vz)
  // Per-particle spawn params. Meaning depends on mode:
  //   orbit_sphere: (sinLat, lonInit, angularVelMult, radius)
  //   orbit_rect:   (tInit, crossOffset, angularVelMult, unused)
  //                 tInit ∈ [0,1) = initial fraction along perimeter;
  //                 crossOffset in px, perpendicular jitter (± into/out of ring).
  //   burst:        (unused) — velocity is written into velocityBuffer at convert-time.
  //   trail:        unused (zeros)
  const paramsBuffer = instancedArray(MAX_POOL_SIZE, 'vec4')

  const cursorPos = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => new THREE.Vector2(-10000, -10000)),
  )
  const cursorPrevPos = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => new THREE.Vector2(-10000, -10000)),
  )
  const cursorColor = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => new THREE.Color('#ffffff')),
  )
  const cursorIntensity = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => 0),
  )
  // Per-cursor global fade multiplier, driven CPU-side. Multiplies the
  // per-particle age-based alpha, so we can collapse a resting-cursor trail
  // faster than its natural lifetime.
  const cursorFadeAlpha = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => 1),
  )
  const cursorFadeStates = Array.from({ length: MAX_CURSORS }, () => ({
    idleElapsed: 0,
    alpha: 1,
  }))
  const fadeOutGraceU = uniform(initial.fadeOutGraceSeconds)
  const fadeOutSecondsU = uniform(initial.fadeOutSeconds)
  let fadeEasing: FadeEasing = initial.fadeOutEasing
  // Speed-gated emission. cursorEmitScale is a per-cursor 0..1 multiplier on
  // the spawn probability, computed CPU-side from prev→curr displacement.
  const cursorEmitScale = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => 0),
  )
  // Per-cursor particle emitter mode. Stored as float (not uint) because uint
  // uniformArray is more restrictive in TSL. Holds one of:
  //   PARTICLE_MODE_TRAIL | PARTICLE_MODE_ORBIT_SPHERE | PARTICLE_MODE_ORBIT_RECT.
  // (PARTICLE_MODE_BURST is never set here — burst is a per-particle transient
  // triggered by the convert kernel, not a cursor-level emitter mode.)
  const cursorEmitterModeU = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => PARTICLE_MODE_TRAIL),
  )
  // Accumulated per-cursor rotation angle in radians. Advanced CPU-side by
  // cursorOrbitAngularVelocity each step, driving orbit particle phase.
  const cursorOrbitAngle = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => 0),
  )
  // Per-cursor angular velocity (radians/sec), hash-seeded from the cursor id
  // so different agents orbit at subtly different rates.
  const cursorOrbitAngularVelocity = new Float64Array(MAX_CURSORS)
  // Per-cursor target rect for orbit_rect mode, as (x, y, w, h) in screen
  // space. Ignored for other modes; initialized to a zero-size rect so
  // the sim wouldn't render anything even if mis-read.
  const cursorTargetRect = uniformArray(
    Array.from({ length: MAX_CURSORS }, () => new THREE.Vector4(0, 0, 0, 0)),
  )
  // Burst trigger: when burstCursorIdx >= 0, the convert kernel runs this
  // frame for that cursor's orbit particles. CPU sets, reads nothing back.
  const burstCursorIdxU = uniform(-1, 'int')
  const emitSpeedReferenceU = uniform(initial.emitSpeedReferencePxPerSec)
  const emitSpeedBiasU = uniform(initial.emitSpeedBias)
  const clampedInitialEmits = Math.max(
    2,
    Math.min(EMIT_PER_FRAME_MAX, Math.round(initial.emitsPerFrame)),
  )
  const emitPerFrameU = uniform(clampedInitialEmits, 'uint')
  const cursorCount = uniform(0, 'uint')
  const writeHead = uniform(0, 'uint')
  // Track which cursor ids we've seen so we can snap prev=curr on first
  // appearance (otherwise the first frame interpolates from (-10000,-10000)).
  const knownIds = new Set<string>()
  // id → index-in-uniformArray, so triggerBurst(id) can resolve the GPU index
  // without re-scanning the cursor list.
  const cursorIndexById = new Map<string, number>()
  const holdU = uniform(initial.holdSeconds)
  const lifetimeU = uniform(initial.lifetimeSeconds)
  const sizeU = uniform(initial.size)
  const driftStrengthU = uniform(initial.driftStrength)
  const driftReferenceDistanceU = uniform(initial.driftReferenceDistance)
  const driftTurnRateU = uniform(initial.driftTurnRate)
  const driftFlowScaleU = uniform(initial.driftFlowScale)
  const orbitSphereRadiusU = uniform(initial.orbitSphereRadiusPx)
  const orbitSphereAngularVelocityU = uniform(initial.orbitSphereAngularVelocity)
  const orbitSphereRadiusFadeInU = uniform(initial.orbitSphereRadiusFadeInSeconds)
  // Spring-damped "gravity" toward the orbit target. Scaled by cursor
  // intensity at sim time: at full intensity the pull is stiff so particles
  // track the sphere surface; when intensity drops (transitioning out) the
  // pull weakens, particles coast on inertia, and a small outward push
  // disperses the ball.
  const orbitSphereConstraintU = uniform(initial.orbitSphereConstraintStrength)
  const orbitSphereDampingU = uniform(initial.orbitSphereDampingPerSecond)
  const orbitSphereDispersalU = uniform(initial.orbitSphereDispersalSpeedPxPerSec)
  const orbitRectCrossJitterU = uniform(initial.orbitRectCrossJitterPx)
  const orbitRectAngularVelocityU = uniform(initial.orbitRectAngularVelocity)
  const orbitRectFadeInU = uniform(initial.orbitRectFadeInSeconds)
  const burstSpeedU = uniform(initial.burstSpeedPxPerSec)
  const burstSpeedJitterU = uniform(initial.burstSpeedJitter)
  const burstLifetimeU = uniform(initial.burstLifetimeSeconds)
  const burstDragU = uniform(initial.burstDragPerSecond)
  const timeU = uniform(0)
  const poolSizeU = uniform(
    Math.max(64, Math.min(MAX_POOL_SIZE, initial.particleCount)),
    'uint',
  )
  const deltaU = uniform(1 / 60) // CPU-driven; compute shaders don't see built-in deltaTime

  // --- Kernels

  const initKernel = Fn(() => {
    positionBuffer.element(instanceIndex).assign(vec3(float(-10000), float(-10000), float(0)))
    // Dead slot: age > lifetime so the sim's age-gate skips it; mode defaults to TRAIL.
    stateBuffer
      .element(instanceIndex)
      .assign(vec3(lifetimeU.add(1), float(0), float(PARTICLE_MODE_TRAIL)))
    velocityBuffer.element(instanceIndex).assign(vec3(0, 0, 0))
    paramsBuffer.element(instanceIndex).assign(vec4(0, 0, 0, 0))
  })().compute(MAX_POOL_SIZE)

  const perCursorU = emitPerFrameU
  const perCursorFloat = float(emitPerFrameU)
  const spawnKernel = Fn(() => {
    const cIdx = instanceIndex.div(perCursorU).toVar()
    If(cIdx.lessThan(cursorCount), () => {
      const gate = hash(instanceIndex.add(writeHead).add(uint(101)))
      const threshold = cursorIntensity.element(cIdx).mul(cursorEmitScale.element(cIdx))
      If(gate.lessThan(threshold), () => {
        const slot = writeHead.add(instanceIndex).mod(poolSizeU)
        const emitterMode = cursorEmitterModeU.element(cIdx)
        const jitterSeed = writeHead.add(instanceIndex.mul(uint(17))).add(uint(7))

        If(emitterMode.equal(float(PARTICLE_MODE_ORBIT_SPHERE)), () => {
          // Orbit sphere: hash-seed a point on a unit sphere (uniform density
          // via sinLat = 2u-1) and bake it + a small per-particle angular
          // velocity variance into paramsBuffer. Sim kernel reconstructs the
          // orbit position every frame.
          const u = hash(jitterSeed)
          const v = hash(jitterSeed.add(uint(53)))
          const w = hash(jitterSeed.add(uint(97)))
          const sinLat = u.mul(2).sub(1)
          const lonInit = v.mul(float(Math.PI * 2))
          const velMult = float(0.85).add(w.mul(0.3)) // 0.85..1.15
          const radius = orbitSphereRadiusU

          // Spawn at cursor center; sim kernel fades radius in from 0 over
          // ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS so particles read as
          // "inhaled" into the sphere.
          const curr = cursorPos.element(cIdx)
          positionBuffer.element(slot).assign(vec3(curr.x, curr.y, float(0)))
          stateBuffer
            .element(slot)
            .assign(vec3(float(0), float(cIdx), float(PARTICLE_MODE_ORBIT_SPHERE)))
          velocityBuffer.element(slot).assign(vec3(0, 0, 0))
          paramsBuffer.element(slot).assign(vec4(sinLat, lonInit, velMult, radius))
        })
          .ElseIf(emitterMode.equal(float(PARTICLE_MODE_ORBIT_RECT)), () => {
            // Orbit rect: hash-seed a position along the perimeter fraction
            // [0,1) with a small perpendicular jitter. Sim kernel resolves
            // (perimeterFraction, crossOffset) → screen-space position each
            // frame from the cursor's current target rect.
            const u = hash(jitterSeed)
            const v = hash(jitterSeed.add(uint(53)))
            const w = hash(jitterSeed.add(uint(97)))
            const tInit = u
            const crossOffset = v.sub(0.5).mul(2).mul(orbitRectCrossJitterU)
            const velMult = float(0.85).add(w.mul(0.3))

            // Spawn at cursor; sim kernel lerps from cursor → perimeter over
            // the fade-in window for the "inhale" effect shared with the sphere.
            const curr = cursorPos.element(cIdx)
            positionBuffer.element(slot).assign(vec3(curr.x, curr.y, float(0)))
            stateBuffer
              .element(slot)
              .assign(vec3(float(0), float(cIdx), float(PARTICLE_MODE_ORBIT_RECT)))
            velocityBuffer.element(slot).assign(vec3(0, 0, 0))
            paramsBuffer.element(slot).assign(vec4(tInit, crossOffset, velMult, float(0)))
          })
          .Else(() => {
            // Trail: distribute emissions along segment prev→curr so fast motion
            // leaves a tight line instead of a gap. Local index within the
            // cursor's batch: 0..EMIT_PER_FRAME-1.
            const localIdx = instanceIndex.mod(perCursorU)
            const t = float(localIdx).div(perCursorFloat.sub(1))
            const prev = cursorPrevPos.element(cIdx)
            const curr = cursorPos.element(cIdx)
            const originX = mix(prev.x, curr.x, t)
            const originY = mix(prev.y, curr.y, t)

            const jx = hash(jitterSeed).sub(0.5).mul(2.0)
            const jy = hash(jitterSeed.add(uint(53))).sub(0.5).mul(2.0)
            positionBuffer
              .element(slot)
              .assign(vec3(originX.add(jx), originY.add(jy), float(0)))
            stateBuffer
              .element(slot)
              .assign(vec3(float(0), float(cIdx), float(PARTICLE_MODE_TRAIL)))
            velocityBuffer.element(slot).assign(vec3(0, 0, 0))
            paramsBuffer.element(slot).assign(vec4(0, 0, 0, 0))
          })
      })
    })
  })().compute(EMIT_PER_FRAME_MAX * MAX_CURSORS)

  const simulateKernel = Fn(() => {
    const pos = positionBuffer.element(instanceIndex)
    const vel = velocityBuffer.element(instanceIndex)
    const state = stateBuffer.element(instanceIndex)
    const mode = state.z
    const age = state.x.add(deltaU).toVar()
    // Burst particles are short-lived; every other mode honors the global
    // lifetimeU (tunable via props).
    const effectiveLifetime = mode
      .equal(float(PARTICLE_MODE_BURST))
      .select(burstLifetimeU, lifetimeU)

    If(age.greaterThan(effectiveLifetime), () => {
      pos.assign(vec3(float(-10000), float(-10000), float(0)))
      state.x.assign(effectiveLifetime)
    }).Else(() => {
      // Mode dispatch. Each mode owns pos/vel updates; trail and burst
      // integrate velocity, orbit modes recompute position from params.
      If(mode.equal(float(PARTICLE_MODE_TRAIL)), () => {
        If(age.greaterThan(holdU), () => {
          // Direction is sampled from a noise field at (seed + pos*flowScale,
          // time*turnRate). turnRate controls how fast each particle's
          // direction evolves; flowScale controls how much neighbors share a
          // direction (0 = fully independent random walk, >0 = flow field).
          const seed = float(instanceIndex).mul(0.137)
          const t = timeU.mul(driftTurnRateU)
          const nx = seed.add(pos.x.mul(driftFlowScaleU))
          const ny = seed.add(float(31.7)).add(pos.y.mul(driftFlowScaleU))
          const n = mx_noise_vec3(vec3(nx, ny, t))
          const dir = vec3(n.x, n.y, float(0))

          // Drift strength eases from 0 (near cursor) to max (far from cursor).
          // This means particles clustered at a resting cursor stay calm, while
          // particles at the far end of a motion trail scatter.
          const cIdx = uint(state.y)
          const cursor = cursorPos.element(cIdx)
          const deltaX = pos.x.sub(cursor.x)
          const deltaY = pos.y.sub(cursor.y)
          const dist = deltaX.mul(deltaX).add(deltaY.mul(deltaY)).sqrt()
          const distFactor = smoothstep(0, driftReferenceDistanceU, dist)
          const strength = driftStrengthU.mul(distFactor)
          vel.assign(dir.mul(strength))
        })
        pos.addAssign(vel.mul(deltaU))
      })
        .ElseIf(mode.equal(float(PARTICLE_MODE_ORBIT_SPHERE)), () => {
          // Each orbit particle has a "target" on a sphere around the cursor,
          // rotating with the cursor's accumulated angle. The particle is
          // spring-pulled toward that target with strength scaled by the
          // cursor's intensity. At intensity=1, pull is stiff so the particle
          // tracks the rotating target (the ball looks rigid). As intensity
          // drops (transitioning out), pull weakens, the particle coasts on
          // inertia, and a small outward "dispersal" push makes the ball
          // visibly scatter rather than just stale in place.
          const cIdx = uint(state.y)
          const cursor = cursorPos.element(cIdx)
          const params = paramsBuffer.element(instanceIndex)
          const sinLat = params.x
          const lonInit = params.y
          const velMult = params.z
          const radius = params.w
          const cursorAngle = cursorOrbitAngle.element(cIdx)
          const lon = lonInit.add(cursorAngle.mul(velMult))
          const cosLat = float(1).sub(sinLat.mul(sinLat)).max(0).sqrt()
          const radiusT = smoothstep(float(0), orbitSphereRadiusFadeInU, age)
          const effectiveR = radius.mul(radiusT)
          const ox = effectiveR.mul(cosLat).mul(lon.cos())
          const oz = effectiveR.mul(cosLat).mul(lon.sin())
          const oy = effectiveR.mul(sinLat)
          const target = vec3(cursor.x.add(ox), cursor.y.add(oy), oz)

          const intensity = cursorIntensity.element(cIdx)
          const k = orbitSphereConstraintU.mul(intensity)
          const pullAccel = target.sub(pos).mul(k)

          // Outward push from cursor, scaled by (1 - intensity). Uses offset
          // from cursor in xy as the direction; if the particle is exactly
          // at the cursor we use a tiny fallback so normalization is safe.
          const offset = vec3(pos.x.sub(cursor.x), pos.y.sub(cursor.y), float(0))
          const offsetLen = offset.x
            .mul(offset.x)
            .add(offset.y.mul(offset.y))
            .sqrt()
            .max(0.001)
          const outwardDir = vec3(
            offset.x.div(offsetLen),
            offset.y.div(offsetLen),
            float(0),
          )
          const dispersalScale = float(1).sub(intensity).max(0)
          const dispersalAccel = outwardDir.mul(
            orbitSphereDispersalU.mul(dispersalScale),
          )

          // Integrate velocity with damping; integrate position.
          const damp = float(1).sub(orbitSphereDampingU.mul(deltaU)).max(0)
          const nextVel = vel
            .mul(damp)
            .add(pullAccel.mul(deltaU))
            .add(dispersalAccel.mul(deltaU))
          vel.assign(nextVel)
          pos.addAssign(nextVel.mul(deltaU))
        })
        .ElseIf(mode.equal(float(PARTICLE_MODE_ORBIT_RECT)), () => {
          // Orbit rect: resolve perimeter fraction t ∈ [0,1) to a position on
          // the current target rect's outline. Rotation reuses the same
          // cursorOrbitAngle accumulator as the sphere so one "revolution"
          // (2π radians) corresponds to one lap around the perimeter.
          const cIdx = uint(state.y)
          const cursor = cursorPos.element(cIdx)
          const params = paramsBuffer.element(instanceIndex)
          const tInit = params.x
          const crossOffset = params.y
          const velMult = params.z
          const rect = cursorTargetRect.element(cIdx)
          const rx = rect.x
          const ry = rect.y
          const rw = rect.z.max(1)
          const rh = rect.w.max(1)
          const perimeter = float(2).mul(rw.add(rh))
          const cursorAngle = cursorOrbitAngle.element(cIdx)
          // Fractional progression; fract() wraps back into [0,1).
          const tRaw = tInit.add(
            cursorAngle.mul(velMult).div(float(Math.PI * 2)),
          )
          const t = tRaw.fract()
          const s = t.mul(perimeter)

          // Segment endpoints in arc-length coordinates: [0, w, w+h, 2w+h, 2w+2h].
          const b1 = rw
          const b2 = rw.add(rh)
          const b3 = rw.mul(2).add(rh)

          // Defaults: compute position for top edge, then overwrite per segment.
          const px = rx.add(s).toVar()
          const py = ry.toVar()
          const nxN = float(0).toVar() // outward normal x
          const nyN = float(-1).toVar() // outward normal y (top edge points up)
          If(s.lessThan(b1), () => {
            // Top edge: left→right
            px.assign(rx.add(s))
            py.assign(ry)
            nxN.assign(float(0))
            nyN.assign(float(-1))
          })
            .ElseIf(s.lessThan(b2), () => {
              // Right edge: top→bottom
              const ls = s.sub(b1)
              px.assign(rx.add(rw))
              py.assign(ry.add(ls))
              nxN.assign(float(1))
              nyN.assign(float(0))
            })
            .ElseIf(s.lessThan(b3), () => {
              // Bottom edge: right→left
              const ls = s.sub(b2)
              px.assign(rx.add(rw).sub(ls))
              py.assign(ry.add(rh))
              nxN.assign(float(0))
              nyN.assign(float(1))
            })
            .Else(() => {
              // Left edge: bottom→top
              const ls = s.sub(b3)
              px.assign(rx)
              py.assign(ry.add(rh).sub(ls))
              nxN.assign(float(-1))
              nyN.assign(float(0))
            })

          // Apply cross jitter along the outward normal so the perimeter
          // reads as a thin band, not a line.
          const perimX = px.add(nxN.mul(crossOffset))
          const perimY = py.add(nyN.mul(crossOffset))

          // Inhale from cursor to perimeter over the fade-in window.
          const fadeT = smoothstep(float(0), orbitRectFadeInU, age)
          const finalX = mix(cursor.x, perimX, fadeT)
          const finalY = mix(cursor.y, perimY, fadeT)
          pos.assign(vec3(finalX, finalY, float(0)))
        })
        .ElseIf(mode.equal(float(PARTICLE_MODE_BURST)), () => {
          // Burst: integrate velocity with exponential drag. Velocity was
          // seeded at convert-time (radial outward from cursor).
          const drag = float(1).sub(burstDragU.mul(deltaU)).max(0)
          vel.assign(vel.mul(drag))
          pos.addAssign(vel.mul(deltaU))
        })
      state.x.assign(age)
    })
  })().compute(MAX_POOL_SIZE)

  // Convert orbit_sphere / orbit_rect particles owned by burstCursorIdx into
  // burst mode: radial velocity outward from cursor, small speed jitter, age
  // reset so the burst fade-in starts fresh. Dispatched on demand by
  // triggerBurst(); no-op when burstCursorIdxU < 0.
  const convertToBurstKernel = Fn(() => {
    const state = stateBuffer.element(instanceIndex)
    const pos = positionBuffer.element(instanceIndex)
    const vel = velocityBuffer.element(instanceIndex)
    const mode = state.z
    const cIdx = state.y
    const isOrbit = mode
      .equal(float(PARTICLE_MODE_ORBIT_SPHERE))
      .or(mode.equal(float(PARTICLE_MODE_ORBIT_RECT)))
    const matches = isOrbit.and(
      cIdx.equal(float(burstCursorIdxU)).and(burstCursorIdxU.greaterThanEqual(0)),
    )
    If(matches, () => {
      const cursor = cursorPos.element(uint(cIdx))
      const dx = pos.x.sub(cursor.x)
      const dy = pos.y.sub(cursor.y)
      // Guard against a particle sitting exactly at cursor center (dist = 0).
      // Fall back to a hash-derived direction so nothing stalls at the origin.
      const dist = dx.mul(dx).add(dy.mul(dy)).sqrt().max(0.0001)
      const seed = hash(instanceIndex.add(uint(17)))
      const seed2 = hash(instanceIndex.add(uint(113)))
      const fallbackAngle = seed.mul(float(Math.PI * 2))
      const useFallback = dist.lessThan(0.5)
      const nx = useFallback.select(fallbackAngle.cos(), dx.div(dist))
      const ny = useFallback.select(fallbackAngle.sin(), dy.div(dist))
      const jitter = float(1)
        .sub(burstSpeedJitterU)
        .add(seed2.mul(burstSpeedJitterU.mul(2)))
      const speed = burstSpeedU.mul(jitter)
      vel.assign(vec3(nx.mul(speed), ny.mul(speed), float(0)))
      state.z.assign(float(PARTICLE_MODE_BURST))
      state.x.assign(float(0))
    })
  })().compute(MAX_POOL_SIZE)

  // Manual per-vertex offset; SpriteNodeMaterial billboarding is unnecessary
  // under an orthographic pixel camera (planes at z=0 already face -Z).
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  })

  // Mode-aware effective lifetime: burst particles age against a shorter
  // lifetime so their fade-out curve compresses into the burst window
  // instead of the global trail/orbit lifetime.
  const effectiveLifetimeFor = (mode: ReturnType<typeof float>) =>
    mode
      .equal(float(PARTICLE_MODE_BURST))
      .select(burstLifetimeU, lifetimeU)

  material.positionNode = Fn(() => {
    const state = stateBuffer.toAttribute()
    const center = positionBuffer.toAttribute()
    const lifeT = state.x.div(effectiveLifetimeFor(state.z)).clamp(0, 1)
    const shrink = float(1).sub(smoothstep(0.4, 1, lifeT))
    // Depth cue for orbit particles: back of sphere (-radius ≤ z < 0) shrinks
    // toward 0.6×, front (+radius) grows toward 1.1×. Trail particles sit at
    // z=0 so the factor is exactly 1 for them. Scale is a gentle linear map;
    // harsh perspective would fight the rest of the 2D layer.
    const depthScale = float(1).add(center.z.mul(0.006))
    const perVertexSize = sizeU.mul(shrink.max(0.15)).mul(depthScale.clamp(0.6, 1.2))
    return positionLocal.mul(perVertexSize).add(center)
  })()

  material.colorNode = Fn(() => {
    const state = stateBuffer.toAttribute()
    const age = state.x
    const cIdx = uint(state.y)
    const base = cursorColor.element(cIdx)
    const lifeT = age.div(effectiveLifetimeFor(state.z)).clamp(0, 1)
    const fadeIn = smoothstep(0, 0.05, lifeT)
    const fadeOut = float(1).sub(smoothstep(0.3, 1, lifeT))
    const globalFade = cursorFadeAlpha.element(cIdx)
    // Radial mask: solid core, smoothstep to 0 before the quad edge so the
    // corners are fully transparent and the particle reads as a round point.
    const dist = uv().sub(vec2(0.5, 0.5)).length()
    const radial = float(1).sub(smoothstep(0.1, 0.5, dist))
    return vec4(base, fadeIn.mul(fadeOut).mul(globalFade).mul(radial))
  })()

  const geometry = new THREE.PlaneGeometry(1, 1)
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_POOL_SIZE)
  mesh.frustumCulled = false
  mesh.count = Math.max(64, Math.min(MAX_POOL_SIZE, initial.particleCount))

  const scene = new THREE.Scene()
  scene.add(mesh)

  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -100, 100)
  camera.position.z = 10

  let writeHeadJS = 0
  let activePoolSize = mesh.count

  const stepCompute = (renderer: THREE.WebGPURenderer, dtSeconds: number) => {
    const dt = Math.min(Math.max(dtSeconds, 0), 1 / 15)
    deltaU.value = dt
    timeU.value += dt

    const activeCount = cursorCount.value
    const fadeDuration = Math.max(fadeOutSecondsU.value, 0.0001)
    const emitRef = Math.max(emitSpeedReferenceU.value, 0.01)
    const emitBias = emitSpeedBiasU.value
    const dtForSpeed = Math.max(dt, 1 / 240)
    for (let i = 0; i < MAX_CURSORS; i++) {
      const s = cursorFadeStates[i]
      const active = i < activeCount && cursorIntensity.array[i] > 0
      if (active) {
        s.idleElapsed = 0
        s.alpha = 1
      } else {
        s.idleElapsed += dt
        const fadeT = Math.min(
          Math.max((s.idleElapsed - fadeOutGraceU.value) / fadeDuration, 0),
          1,
        )
        s.alpha = 1 - applyEase(fadeT, fadeEasing)
      }
      cursorFadeAlpha.array[i] = s.alpha

      if (i < activeCount) {
        const mode = cursorEmitterModeU.array[i]
        const isOrbit =
          mode === PARTICLE_MODE_ORBIT_SPHERE ||
          mode === PARTICLE_MODE_ORBIT_RECT
        if (isOrbit) {
          // Orbit modes bypass the speed gate — emission should continue
          // while the cursor sits still thinking/inspecting.
          cursorEmitScale.array[i] = 1
          cursorOrbitAngle.array[i] += cursorOrbitAngularVelocity[i] * dt
        } else {
          const curr = cursorPos.array[i]
          const prev = cursorPrevPos.array[i]
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          const speed = Math.sqrt(dx * dx + dy * dy) / dtForSpeed
          const normalized = Math.min(speed / emitRef, 1)
          cursorEmitScale.array[i] = Math.pow(normalized, emitBias)
        }
      } else {
        cursorEmitScale.array[i] = 0
      }
    }

    // Burst conversion dispatches before spawn/sim so new orbit particles
    // emitted this frame aren't immediately converted. burstCursorIdxU < 0
    // makes the kernel a no-op.
    if (burstCursorIdxU.value >= 0) {
      renderer.compute(convertToBurstKernel)
      burstCursorIdxU.value = -1
    }
    renderer.compute(spawnKernel)
    renderer.compute(simulateKernel)
    writeHeadJS = (writeHeadJS + emitPerFrameU.value * MAX_CURSORS) % activePoolSize
    writeHead.value = writeHeadJS
    // After dispatch, current frame's cursor positions become "previous"
    // for the next frame's segment interpolation.
    for (let i = 0; i < cursorCount.value; i++) {
      cursorPrevPos.array[i].copy(cursorPos.array[i])
    }
  }

  const init = (renderer: THREE.WebGPURenderer) => {
    renderer.compute(initKernel)
  }

  const resize = (w: number, h: number) => {
    camera.left = 0
    camera.right = w
    camera.top = 0
    camera.bottom = h
    camera.updateProjectionMatrix()
  }

  const handle: Handle = {
    pushCursors(cursors) {
      const n = Math.min(cursors.length, MAX_CURSORS)
      cursorCount.value = n
      const seen = new Set<string>()
      for (let i = 0; i < n; i++) {
        const c = cursors[i]
        seen.add(c.id)
        // First time we see this id, snap prev=curr so the first emission
        // doesn't interpolate from a stale/off-screen previous position and
        // hash-seed a per-agent angular velocity so sphere rotations differ.
        if (!knownIds.has(c.id)) {
          cursorPrevPos.array[i].set(c.x, c.y)
          knownIds.add(c.id)
          const h = hashStringToUnit(c.id)
          const baseAngularVelocity =
            c.emitterMode === 'orbit_rect'
              ? orbitRectAngularVelocityU.value
              : orbitSphereAngularVelocityU.value
          cursorOrbitAngularVelocity[i] = baseAngularVelocity * (0.7 + 0.6 * h)
          cursorOrbitAngle.array[i] = h * Math.PI * 2
        }
        cursorIndexById.set(c.id, i)
        cursorPos.array[i].set(c.x, c.y)
        cursorColor.array[i].set(c.color)
        cursorIntensity.array[i] = c.intensity
        cursorEmitterModeU.array[i] =
          c.emitterMode === 'orbit_sphere'
            ? PARTICLE_MODE_ORBIT_SPHERE
            : c.emitterMode === 'orbit_rect'
              ? PARTICLE_MODE_ORBIT_RECT
              : PARTICLE_MODE_TRAIL
        if (c.emitterMode === 'orbit_rect' && c.targetRect) {
          cursorTargetRect.array[i].set(
            c.targetRect.x,
            c.targetRect.y,
            c.targetRect.width,
            c.targetRect.height,
          )
        } else {
          cursorTargetRect.array[i].set(0, 0, 0, 0)
        }
      }
      for (const id of knownIds) {
        if (!seen.has(id)) {
          knownIds.delete(id)
          cursorIndexById.delete(id)
        }
      }
    },
    triggerBurst(id: string) {
      const idx = cursorIndexById.get(id)
      if (idx === undefined) return
      burstCursorIdxU.value = idx
    },
    setParams(p) {
      holdU.value = p.holdSeconds
      lifetimeU.value = p.lifetimeSeconds
      sizeU.value = p.size
      driftStrengthU.value = p.driftStrength
      driftReferenceDistanceU.value = p.driftReferenceDistance
      driftTurnRateU.value = p.driftTurnRate
      driftFlowScaleU.value = p.driftFlowScale
      fadeOutGraceU.value = p.fadeOutGraceSeconds
      fadeOutSecondsU.value = p.fadeOutSeconds
      fadeEasing = p.fadeOutEasing
      emitSpeedReferenceU.value = p.emitSpeedReferencePxPerSec
      emitSpeedBiasU.value = p.emitSpeedBias
      emitPerFrameU.value = Math.max(
        2,
        Math.min(EMIT_PER_FRAME_MAX, Math.round(p.emitsPerFrame)),
      )
      const next = Math.max(64, Math.min(MAX_POOL_SIZE, p.particleCount))
      if (next !== activePoolSize) {
        activePoolSize = next
        poolSizeU.value = next
        mesh.count = next
        writeHeadJS = writeHeadJS % next
        writeHead.value = writeHeadJS
      }
    },
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { scene, camera, stepCompute, init, resize, handle, dispose }
}

export function PresenceParticleTrail({
  cursors,
  holdSeconds = 0.3,
  lifetimeSeconds = 2.5,
  size = 4,
  driftStrength = 30,
  driftReferenceDistance = 180,
  driftTurnRate = 0.7,
  driftFlowScale = 0.001,
  particleCount = 8192,
  fadeOutGraceSeconds = 0.2,
  fadeOutSeconds = 1.2,
  fadeOutEasing = 'ease-in',
  emitSpeedReferencePxPerSec = 1250,
  emitSpeedBias = 2.35,
  emitsPerFrame = 16,
  orbitSphereRadiusPx = ORBIT_SPHERE_RADIUS_PX,
  orbitSphereAngularVelocityRadPerSec = ORBIT_SPHERE_ANGULAR_VELOCITY,
  orbitSphereRadiusFadeInSeconds = ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS,
  orbitSphereConstraintStrength = ORBIT_SPHERE_CONSTRAINT_STRENGTH,
  orbitSphereDampingPerSecond = ORBIT_SPHERE_DAMPING_PER_SECOND,
  orbitSphereDispersalSpeedPxPerSec = ORBIT_SPHERE_DISPERSAL_SPEED,
  orbitRectCrossJitterPx = ORBIT_RECT_CROSS_JITTER_PX,
  orbitRectAngularVelocityRadPerSec = ORBIT_SPHERE_ANGULAR_VELOCITY,
  orbitRectFadeInSeconds = ORBIT_RECT_FADE_IN_SECONDS,
  burstSpeedPxPerSec = BURST_SPEED_PX_PER_SEC,
  burstSpeedJitter = BURST_SPEED_JITTER,
  burstLifetimeSeconds = BURST_LIFETIME_SECONDS,
  burstDragPerSecond = BURST_DRAG_PER_SECOND,
  onReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<Handle | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      // eslint-disable-next-line no-console
      console.warn('[trail] WebGPU not available')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    host.appendChild(canvas)

    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    let rafId = 0
    let disposed = false
    let system: ReturnType<typeof buildSystem> | null = null

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      if (system) system.resize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    renderer
      .init()
      .then(() => {
        if (disposed) return
        system = buildSystem({
          holdSeconds,
          lifetimeSeconds,
          size,
          driftStrength,
          driftReferenceDistance,
          driftTurnRate,
          driftFlowScale,
          particleCount,
          fadeOutGraceSeconds,
          fadeOutSeconds,
          fadeOutEasing,
          emitSpeedReferencePxPerSec,
          emitSpeedBias,
          emitsPerFrame,
          orbitSphereRadiusPx,
          orbitSphereAngularVelocity: orbitSphereAngularVelocityRadPerSec,
          orbitSphereRadiusFadeInSeconds,
          orbitSphereConstraintStrength,
          orbitSphereDampingPerSecond,
          orbitSphereDispersalSpeedPxPerSec,
          orbitRectCrossJitterPx,
          orbitRectAngularVelocity: orbitRectAngularVelocityRadPerSec,
          orbitRectFadeInSeconds,
          burstSpeedPxPerSec,
          burstSpeedJitter,
          burstLifetimeSeconds,
          burstDragPerSecond,
        })
        handleRef.current = system.handle
        if (cursors) system.handle.pushCursors(cursors)
        system.init(renderer)
        resize()
        onReadyRef.current?.({
          pushCursors: (next) => system!.handle.pushCursors(next),
          triggerBurst: (id) => system!.handle.triggerBurst(id),
        })

        let lastT = performance.now()
        const tick = () => {
          if (disposed || !system) return
          const now = performance.now()
          const dtSeconds = (now - lastT) / 1000
          lastT = now
          system.stepCompute(renderer, dtSeconds)
          try {
            renderer.render(system.scene, system.camera)
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[trail] render', err)
          }
          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[trail] init failed', err)
      })

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
      system?.dispose()
      renderer.dispose()
      canvas.remove()
      handleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cursors) return
    handleRef.current?.pushCursors(cursors)
  }, [cursors])

  useEffect(() => {
    handleRef.current?.setParams({
      holdSeconds,
      lifetimeSeconds,
      size,
      driftStrength,
      driftReferenceDistance,
      driftTurnRate,
      driftFlowScale,
      particleCount,
      fadeOutGraceSeconds,
      fadeOutSeconds,
      fadeOutEasing,
      emitSpeedReferencePxPerSec,
      emitSpeedBias,
      emitsPerFrame,
    })
  }, [
    holdSeconds,
    lifetimeSeconds,
    size,
    driftStrength,
    driftReferenceDistance,
    driftTurnRate,
    driftFlowScale,
    particleCount,
    fadeOutGraceSeconds,
    fadeOutSeconds,
    fadeOutEasing,
    emitSpeedReferencePxPerSec,
    emitSpeedBias,
    emitsPerFrame,
  ])

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 9998 }}
    />
  )
}
