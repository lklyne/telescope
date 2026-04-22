# Storage Buffers & Compute Shaders

**Back to:** [SKILL.md](../SKILL.md)

## Overview

WebGPU-only feature for GPGPU tasks: particle systems, simulations, physics, and complex per-frame calculations.

## ⚠️ Critical: Renderer Initialization

**Always await `renderer.init()` before any rendering or compute operations.**

```tsx
const renderer = new THREE.WebGPURenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// REQUIRED before any rendering or compute
await renderer.init()

// Now safe to render/compute
renderer.render(scene, camera)
renderer.compute(computeShader)
```

Without `await renderer.init()`, rendering silently fails or produces black screens.

## Storage Buffer Pattern

```tsx
import { StorageBufferAttribute } from 'three/webgpu'
import { storage, instancedArray, textureStore } from 'three/tsl'

// 1. Create storage buffer
const positions = new Float32Array(particleCount * 3)
const positionBuffer = new StorageBufferAttribute(positions, 3)

// 2. Bind to storage node in compute shader
const positionStorage = storage(positionBuffer, 'vec3', particleCount)

// 3. Read/write in compute
const computeParticles = Fn(() => {
  const index = instanceIndex
  const pos = positionStorage.element(index).toVar()

  // Update position
  pos.y.addAssign(0.01)

  // Write back
  positionStorage.element(index).assign(pos)
})().compute(particleCount)  // Note: .compute(count) for standalone

// 4. Drive in useFrame (r3f)
useFrame(({ gl }) => {
  gl.compute?.(computeParticles)
})

// Or vanilla Three.js
renderer.compute(computeParticles)
```

## instancedArray (Cleaner API)

Simplified storage array without manual buffer creation:

```tsx
// Simplified storage array (no manual buffer creation)
const positionsArray = instancedArray(particleCount, 'vec3')
const velocitiesArray = instancedArray(particleCount, 'vec3')

const computeParticles = Fn(() => {
  const idx = instanceIndex
  const pos = positionsArray.element(idx).toVar()
  const vel = velocitiesArray.element(idx).toVar()

  // Physics
  vel.y.subAssign(0.001) // Gravity
  pos.addAssign(vel)

  // Bounce
  If(pos.y.lessThan(0), () => {
    pos.y.assign(0)
    vel.y.mulAssign(-0.8)
  })

  positionsArray.element(idx).assign(pos)
  velocitiesArray.element(idx).assign(vel)
})()
```

## Compute → Render Pipeline

When compute shader output needs to be rendered (particles, procedural geometry), use `StorageInstancedBufferAttribute` with `storage()` for writing and `attribute()` for reading.

```tsx
import { Fn, instanceIndex, storage, attribute, vec4 } from 'three/tsl'

const COUNT = 1000

// 1. Create typed array and storage attribute
const dataArray = new Float32Array(COUNT * 4)
const dataAttribute = new THREE.StorageInstancedBufferAttribute(dataArray, 4)

// 2. Create storage node for compute shader (write access)
const dataStorage = storage(dataAttribute, 'vec4', COUNT)

// 3. Define compute shader
const computeShader = Fn(() => {
  const idx = instanceIndex
  const current = dataStorage.element(idx)
  
  // Modify data...
  const newValue = current.xyz.add(vec3(0.01, 0, 0))
  
  dataStorage.element(idx).assign(vec4(newValue, current.w))
})().compute(COUNT)

// 4. Attach attribute to geometry for rendering
const geometry = new THREE.BufferGeometry()
// ... set up base geometry ...
geometry.setAttribute('instanceData', dataAttribute)

// 5. Read in material using attribute() — NOT storage()!
const material = new THREE.MeshBasicNodeMaterial()
material.positionNode = Fn(() => {
  const data = attribute('instanceData', 'vec4')
  return positionLocal.add(data.xyz)
})()

// 6. Create mesh
const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
scene.add(mesh)

// 7. Animation loop
await renderer.init()
function animate() {
  renderer.compute(computeShader)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()
```

### ⚠️ Common Mistake

```tsx
// ❌ WRONG: Using storage() in render material
material.positionNode = storage(attr, 'vec4', count).element(idx).xyz

// ✅ CORRECT: Use attribute() to read in render shaders
geometry.setAttribute('myData', attr)
material.positionNode = attribute('myData', 'vec4').xyz
```

## Updating Buffers from JavaScript

```tsx
// Modify the underlying array
for (let i = 0; i < COUNT; i++) {
  dataArray[i * 4] = Math.random()
}

// Flag for GPU upload
dataAttribute.needsUpdate = true
```

## Storage Textures (2D Data, Effects)

For screen-space effects and 2D data processing:

```tsx
// ⚠️ Account for DPR!
const tex = new THREE.StorageTexture(
  width * devicePixelRatio,
  height * devicePixelRatio
)

// Write to texture in compute
const computeEffect = Fn(() => {
  // Map instanceIndex → (x,y) coordinates
  const x = instanceIndex.mod(int(tex.width))
  const y = instanceIndex.div(int(tex.width))

  // Compute UV from coordinates
  const uv = vec2(
    float(x).div(tex.width),
    float(y).div(tex.height)
  )

  // Compute color/value
  const value = noise2D(uv.mul(10))

  // Write to storage texture
  textureStore(tex, uvec2(x, y), vec4(value, value, value, 1))
})()

// Use texture in material
material.colorNode = texture(tex)
```

## Compute Lifecycle

```tsx
// Setup (once)
const computeNode = Fn(() => { /* ... */ })().compute(count)

// Synchronous (every frame)
renderer.compute(computeNode)

// Async (heavy one-off tasks)
await renderer.computeAsync(computeNode)
```

### r3f useFrame Pattern

```tsx
useFrame(({ gl }) => {
  gl.compute?.(computeNode)  // Optional chaining for WebGL fallback
})
```

### Conditional Compute

```tsx
useFrame(({ gl }) => {
  if (needsUpdate) {
    gl.compute?.(computeNode)
  }
})
```

## WebGPU Integration

### Renderer Setup

```tsx
import * as THREE from 'three/webgpu'

const renderer = new THREE.WebGPURenderer({ antialias: true })
await renderer.init()
```

### r3f Setup

```tsx
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three/webgpu'

const renderer = new THREE.WebGPURenderer()
await renderer.init()

<Canvas gl={renderer}>
  {/* ... */}
</Canvas>
```

### Fallback Strategy

TSL materials work on both backends (compute is WebGPU-only):

```tsx
const isWebGPU = navigator.gpu !== undefined

const renderer = isWebGPU 
  ? new THREE.WebGPURenderer()
  : new THREE.WebGLRenderer()

if (isWebGPU) {
  await renderer.init()
}
```

### Lights Setup

Add lights via `scene.add()`, not JSX, to avoid TSL/extend glitches:

```tsx
const light = new THREE.DirectionalLight()
scene.add(light)
```

## Atomic Operations

Thread-safe read-modify-write for shared storage buffers:

```tsx
import { atomicAdd, atomicSub, atomicMax, atomicMin,
         atomicAnd, atomicOr, atomicXor,
         atomicStore, atomicLoad, atomicFunc } from 'three/tsl'

const counter = instancedArray(1, 'uint')

const computeShader = Fn(() => {
  // Atomic increment — returns previous value
  const prev = atomicAdd(counter.element(0), 1)

  // Other atomic operations
  atomicSub(counter.element(0), 1)
  atomicMax(counter.element(0), instanceIndex)
  atomicMin(counter.element(0), instanceIndex)

  // Bitwise atomics
  atomicAnd(counter.element(0), uint(0xFF))
  atomicOr(counter.element(0), uint(0x01))
  atomicXor(counter.element(0), uint(0x10))

  // Direct load/store
  const val = atomicLoad(counter.element(0))
  atomicStore(counter.element(0), uint(42))
})().compute(1024)
```

## Barriers

Synchronize threads within a workgroup:

```tsx
import { workgroupBarrier, storageBarrier, textureBarrier } from 'three/tsl'

const computeShader = Fn(() => {
  // Wait for all threads in workgroup to reach this point
  workgroupBarrier()

  // Wait for storage buffer writes to be visible
  storageBarrier()

  // Wait for texture writes to be visible
  textureBarrier()
})()
```

## Compute Built-in Variables

| Variable | Type | Description |
|----------|------|-------------|
| `instanceIndex` | uint | Global thread index (most common) |
| `localId` | uvec3 | Thread index within workgroup |
| `globalId` | uvec3 | Global thread index (3D) |
| `workgroupId` | uvec3 | Workgroup index |
| `numWorkgroups` | uvec3 | Total number of workgroups |
| `subgroupSize` | uint | Number of threads in a subgroup |

```tsx
import { localId, globalId, workgroupId, numWorkgroups, subgroupSize } from 'three/tsl'

const computeShader = Fn(() => {
  // Use localId for shared memory patterns
  const localIdx = localId.x

  // Use globalId for 2D/3D dispatch
  const x = globalId.x
  const y = globalId.y

  // Workgroup-level operations
  const wgIdx = workgroupId.x
})()
```

## Performance Tips

- Batch compute calls — minimize threadgroup divergence
- Use half-res textures for post when acceptable
- Cap DPR on mobile (max 2x, prefer 1.5x)
- Avoid reading back to CPU — keep data on GPU
- Use atomics sparingly — they serialize access and reduce throughput

## Related

- [arrays.md](arrays.md) — instancedArray usage
- [coordinates.md](coordinates.md) — DPR handling for storage textures
- [optimization.md](optimization.md) — Compute performance tips
- [errors.md](errors.md) — Common compute errors
