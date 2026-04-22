# Arrays in TSL

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides three array types optimized for different use cases: constant compile-time arrays, CPU-updatable uniform arrays, and large GPU storage arrays.

## Array Types Comparison

| Type | Use Case | Size Limit | Updatable | Access Method |
|------|----------|------------|-----------|---------------|
| `array()` | Constant data | Small (~100) | No (compile-time) | Static or `.element()` |
| `uniformArray()` | Dynamic CPU data | Medium (~1000) | Yes (from CPU) | `.element()` |
| `attributeArray()` | Per-vertex data | Any | Yes (from CPU) | `.element()` |
| `instancedArray()` | Storage buffer | Large (100k+) | Yes (from GPU) | `.element()` |

## array() - Constant Arrays

Compile-time constant arrays for static data.

```tsx
import { array } from 'three/tsl'

// Compile-time constant array
const colors = array([
  vec3(1, 0, 0),  // Red
  vec3(0, 1, 0),  // Green
  vec3(0, 0, 1)   // Blue
])

// Static index (compile-time)
material.colorNode = colors[0]  // Red

// Dynamic index (runtime)
const index = instanceIndex.mod(3)
material.colorNode = colors.element(index)
```

## uniformArray() - CPU-Updatable Arrays

Arrays that can be updated from the CPU side in useFrame.

```tsx
import { uniformArray } from 'three/tsl'

// Create uniform array
const tints = uniformArray([
  new THREE.Color(0xff0000),
  new THREE.Color(0x00ff00),
  new THREE.Color(0x0000ff)
], 'color')

// Access with dynamic index
const idx = instanceIndex.mod(3)
material.colorNode = tints.element(idx)

// Update from CPU (in useFrame)
useFrame(() => {
  tints.value[0].setHSL(time * 0.1, 1, 0.5)
  tints.needsUpdate = true  // Flag for update
})
```

## attributeArray() - Per-Vertex Attribute Arrays

Arrays backed by buffer attributes, suitable for per-vertex data.

```tsx
import { attributeArray } from 'three/tsl'

// Create per-vertex attribute array
const offsets = attributeArray(vertexCount, 'vec3')

// Use in material
material.positionNode = positionLocal.add(offsets.element(vertexIndex))

// Update from CPU
offsets.array[0] = 1.0  // Modify underlying typed array
offsets.needsUpdate = true
```

## instancedArray() - Storage Buffer (WebGPU)

Large storage-backed arrays for GPU compute shaders.

```tsx
import { instancedArray } from 'three/tsl'

// Large storage-backed array (GPU-only)
const positions = instancedArray(10000, 'vec3')
const velocities = instancedArray(10000, 'vec3')

// Read/write in compute shader
const computeParticles = Fn(() => {
  const idx = instanceIndex
  const pos = positions.element(idx).toVar()
  const vel = velocities.element(idx).toVar()

  // Update
  pos.addAssign(vel)

  // Write back
  positions.element(idx).assign(pos)
})()

// Read in material
material.positionNode = positions.element(instanceIndex)
```

## Index Access Methods

```tsx
const arr = array([vec3(1,0,0), vec3(0,1,0), vec3(0,0,1)])

// Static index (compile-time) - MUST be literal number
const red = arr[0]
const green = arr[1]

// Dynamic index (runtime) - can be any node
const idx = instanceIndex.mod(3)
const color = arr.element(idx)

// ⚠️ Can't use variable with []
const i = 1
const bad = arr[i]  // Error! Use arr.element(int(i)) instead
```

## Common Patterns

### Per-Instance Colors

```tsx
const palette = array([
  vec3(1, 0, 0),
  vec3(0, 1, 0),
  vec3(0, 0, 1),
  vec3(1, 1, 0)
])
const colorIdx = instanceIndex.mod(4)
material.colorNode = palette.element(colorIdx)
```

### Animation Keyframes

```tsx
const positions = uniformArray([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(1, 1, 0)
], 'vec3')

const t = time.mod(3).floor()  // 0, 1, 2
material.positionNode = positionLocal.add(positions.element(int(t)))
```

### Particle System (Large Scale)

```tsx
const particlePos = instancedArray(100000, 'vec3')
const particleCol = instancedArray(100000, 'vec3')

// Use in instanced mesh
material.positionNode = particlePos.element(instanceIndex)
material.colorNode = particleCol.element(instanceIndex)
```

## Related

- [compute.md](compute.md) - Using instancedArray with compute shaders
- [optimization.md](optimization.md) - Performance considerations for arrays
