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

// Orbit sphere tuning. Radius is in the same units as particle positions (CSS
// pixels after the cursor offset). Angular velocity is radians per second; small
// so the sphere reads as a gentle revolve, not a flicker.
const ORBIT_SPHERE_RADIUS_PX = 28
const ORBIT_SPHERE_ANGULAR_VELOCITY = 0.6
// Particles grow from the cursor center out to ORBIT_SPHERE_RADIUS_PX over this
// many seconds of their life — the "inhalation" into the sphere.
const ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS = 0.35

function hashStringToUnit(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 0) / 0xffffffff
}

// Screen-space offset from the cursor's translate origin to the tip of the
// FilledCursorIcon, so trail particles emit from the tip rather than the
// top-left of the icon. Shared by AgentCursorLayer (production) and
// PresencePlayground (debug defaults).
export const CURSOR_TRAIL_OFFSET = { x: 12, y: 16 } as const

export type PresenceParticleEmitterMode = 'trail' | 'orbit_sphere'

export interface PresenceParticleCursor {
  id: string
  x: number
  y: number
  color: string
  intensity: number
  /** Defaults to 'trail' when omitted to preserve existing callers. */
  emitterMode?: PresenceParticleEmitterMode
}

interface Props {
  cursors: PresenceParticleCursor[]
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
}) {
  const positionBuffer = instancedArray(MAX_POOL_SIZE, 'vec3') // (x, y, z)
  const stateBuffer = instancedArray(MAX_POOL_SIZE, 'vec3')    // (age, cursorIdx, mode)
  const velocityBuffer = instancedArray(MAX_POOL_SIZE, 'vec3') // (vx, vy, vz)
  // Per-particle spawn params. Meaning depends on mode:
  //   orbit_sphere: (sinLat, lonInit, angularVelMult, radius)
  //   trail:        unused (zeros)
  // sinLat in [-1,1]; cosLat is reconstructed as sqrt(1 - sinLat²) in the sim.
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
  // Per-cursor particle emitter mode (0 = trail, 1 = orbit_sphere). Stored as
  // float (not uint) because uint uniformArray is more restrictive in TSL.
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
  const holdU = uniform(initial.holdSeconds)
  const lifetimeU = uniform(initial.lifetimeSeconds)
  const sizeU = uniform(initial.size)
  const driftStrengthU = uniform(initial.driftStrength)
  const driftReferenceDistanceU = uniform(initial.driftReferenceDistance)
  const driftTurnRateU = uniform(initial.driftTurnRate)
  const driftFlowScaleU = uniform(initial.driftFlowScale)
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
          const radius = float(ORBIT_SPHERE_RADIUS_PX)

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
        }).Else(() => {
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

    If(age.greaterThan(lifetimeU), () => {
      pos.assign(vec3(float(-10000), float(-10000), float(0)))
      state.x.assign(lifetimeU)
    }).Else(() => {
      // Mode dispatch. Each mode is responsible for updating pos/vel as it sees
      // fit (trail integrates velocity; orbit/burst will compute differently).
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
      If(mode.equal(float(PARTICLE_MODE_ORBIT_SPHERE)), () => {
        // Orbit particles don't integrate; their position is rebuilt each
        // frame from baked-in (sinLat, lonInit, velMult, radius) plus the
        // cursor's accumulated rotation angle. Rotation is around the screen's
        // vertical axis, so lat → y offset, (cos, sin) of longitude → (x, z).
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
        // Ease radius from 0 → full over the first fade-in window so the
        // sphere "inhales" from the cursor rather than popping in.
        const radiusT = smoothstep(0, ORBIT_SPHERE_RADIUS_FADE_IN_SECONDS, age)
        const effectiveR = radius.mul(radiusT)
        const ox = effectiveR.mul(cosLat).mul(lon.cos())
        const oz = effectiveR.mul(cosLat).mul(lon.sin())
        const oy = effectiveR.mul(sinLat)
        pos.assign(vec3(cursor.x.add(ox), cursor.y.add(oy), oz))
      })
      state.x.assign(age)
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

  material.positionNode = Fn(() => {
    const state = stateBuffer.toAttribute()
    const center = positionBuffer.toAttribute()
    const lifeT = state.x.div(lifetimeU).clamp(0, 1)
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
    const lifeT = age.div(lifetimeU).clamp(0, 1)
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
        const isOrbit =
          cursorEmitterModeU.array[i] === PARTICLE_MODE_ORBIT_SPHERE
        if (isOrbit) {
          // Orbit mode bypasses the speed gate — emission should continue
          // while the cursor sits still thinking.
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
          cursorOrbitAngularVelocity[i] =
            ORBIT_SPHERE_ANGULAR_VELOCITY * (0.7 + 0.6 * h)
          cursorOrbitAngle.array[i] = h * Math.PI * 2
        }
        cursorPos.array[i].set(c.x, c.y)
        cursorColor.array[i].set(c.color)
        cursorIntensity.array[i] = c.intensity
        cursorEmitterModeU.array[i] =
          c.emitterMode === 'orbit_sphere'
            ? PARTICLE_MODE_ORBIT_SPHERE
            : PARTICLE_MODE_TRAIL
      }
      for (const id of knownIds) {
        if (!seen.has(id)) knownIds.delete(id)
      }
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
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<Handle | null>(null)

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
        })
        handleRef.current = system.handle
        system.handle.pushCursors(cursors)
        system.init(renderer)
        resize()

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
