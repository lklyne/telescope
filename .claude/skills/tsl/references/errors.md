# Common Errors & Solutions

**Back to:** [SKILL.md](../SKILL.md)

## Overview

Quick reference for common TSL errors and how to fix them.

## ⚠️ Deprecated APIs (r181+)

These cause warnings or silent failures. Update immediately.

| ❌ Deprecated | ✅ Replacement | Notes |
|---------------|----------------|-------|
| `timerGlobal` | `time` | Elapsed seconds |
| `timerLocal` | `time` | Same as above |
| `timerDelta` | `deltaTime` | Frame delta |
| `import from 'three/nodes'` | `import from 'three/tsl'` | Import path changed |
| `import * as THREE from 'three'` | `import * as THREE from 'three/webgpu'` | Must use WebGPU bundle |
| `oscSine(timerGlobal)` | `oscSine(time)` or `oscSine()` | Oscillators use time by default |

## ⚠️ r183 Breaking Changes

| ❌ Deprecated | ✅ Replacement | Notes |
|---------------|----------------|-------|
| `new PostProcessing(renderer)` | `new RenderPipeline(renderer)` | Class renamed |
| `Line2NodeMaterial.useColor` | `Line2NodeMaterial.vertexColors` | Property renamed |
| `scriptable` node | `Fn()` | Node removed entirely |
| `THREE.Clock` | `THREE.Timer` | Clock deprecated |

## Import Errors

### "Cannot find module 'three/nodes'"

```tsx
// ❌ WRONG
import { vec3 } from 'three/nodes'

// ✅ CORRECT
import { vec3 } from 'three/tsl'
```

### "WebGPURenderer is not defined" / TSL not working

```tsx
// ❌ WRONG: WebGL bundle doesn't include TSL
import * as THREE from 'three'

// ✅ CORRECT: WebGPU bundle includes TSL
import * as THREE from 'three/webgpu'
```

## Render Errors

### Nothing renders / Black screen

```tsx
// ❌ WRONG: Rendering before initialization
const renderer = new THREE.WebGPURenderer()
renderer.render(scene, camera)  // Fails silently!

// ✅ CORRECT: Always await init first
const renderer = new THREE.WebGPURenderer()
await renderer.init()
renderer.render(scene, camera)
```

### "Shader frozen" / Uniforms not updating

```tsx
// ❌ WRONG: Recreating uniforms on every render
function Component() {
  const uniforms = {  // New object each render!
    uTime: uniform(0)
  }
}

// ✅ CORRECT: Memoize uniforms
function Component() {
  const uniforms = useMemo(() => ({
    uTime: uniform(0)
  }), [])
  
  useFrame((_, delta) => {
    uniforms.uTime.value += delta
  })
}
```

## Syntax Errors

### "If is not defined"

```tsx
// ❌ WRONG: lowercase 'if'
if(condition, () => {})

// ✅ CORRECT: capital 'If'
If(condition, () => {})
```

### "Cannot assign to read-only property"

```tsx
// ❌ WRONG: TSL nodes are immutable
const pos = positionLocal
pos.y = pos.y.add(1)  // ERROR!

// ✅ CORRECT: Use .toVar() for mutable variable
const pos = positionLocal.toVar()
pos.y.assign(pos.y.add(1))  // OK
```

### "x.assign is not a function"

Same as above — you're trying to assign to an immutable node. Use `.toVar()` first.

## Type Errors

### "Expected float, got int" / Type mismatch

```tsx
// ❌ WRONG: sqrt expects float, got int
sqrt(intValue)

// ✅ CORRECT: Convert type first
sqrt(intValue.toFloat())
```

### "Cannot read property 'x' of undefined"

Usually means you're using a node incorrectly:

```tsx
// ❌ WRONG: Accessing before it exists
const x = uniform().value.x

// ✅ CORRECT: Initialize uniform properly
const u = uniform(new THREE.Vector3())
const x = u.value.x
```

## Uniform Errors

### Uniform value not changing

```tsx
// ❌ WRONG: Reassigning uniform
myUniform = newValue

// ✅ CORRECT: Mutate .value
myUniform.value = newValue
```

### Uniform causing infinite loop / performance issues

```tsx
// ❌ WRONG: setState in useFrame
useFrame(() => {
  setTime(t => t + 0.01)  // Re-renders every frame!
})

// ✅ CORRECT: Mutate ref or uniform
useFrame((_, delta) => {
  uniforms.time.value += delta  // No re-render
})
```

## Compute Shader Errors

### Compute data not visible in render shader

```tsx
// ❌ WRONG: Using storage() in render material
material.positionNode = storage(attr, 'vec4', count).element(idx).xyz

// ✅ CORRECT: Use attribute() to read in render shaders
geometry.setAttribute('myData', attr)
material.positionNode = attribute('myData', 'vec4').xyz
```

### "Buffer not found" in compute

Make sure you're using `StorageBufferAttribute` not regular `BufferAttribute`:

```tsx
// ❌ WRONG: Regular buffer
const attr = new THREE.BufferAttribute(array, 4)

// ✅ CORRECT: Storage buffer
const attr = new THREE.StorageBufferAttribute(array, 4)
```

## Control Flow Errors

### "Cannot use If outside Fn()"

Control flow requires `Fn()` wrapper:

```tsx
// ❌ WRONG: If at top level
material.colorNode = If(condition, () => red).Else(() => blue)

// ✅ CORRECT: Wrap in Fn()
material.colorNode = Fn(() => {
  const result = vec3(0).toVar()
  If(condition, () => { result.assign(red) })
    .Else(() => { result.assign(blue) })
  return result
})()

// ✅ BETTER: Use select() which works outside Fn()
material.colorNode = select(condition, red, blue)
```

## React/r3f Specific Errors

### "TypeError: Cannot read properties of undefined"

Often happens when React state is used directly in TSL:

```tsx
// ❌ WRONG: React state in TSL operations
const { intensity } = useControls({ intensity: 0.5 })
useEffect(() => {
  const scaled = color.mul(intensity)  // intensity is JS number!
}, [intensity])

// ✅ CORRECT: Wrap in TSL constructor
useEffect(() => {
  const intensityTSL = float(intensity)
  const scaled = color.mul(intensityTSL)
}, [intensity])
```

### Material not updating after control change

```tsx
// ❌ WRONG: Creating new uniform in useControls
const { roughness } = useControls({ roughness: 0.5 })
material.roughnessNode = uniform(roughness)  // New uniform each time!

// ✅ CORRECT: Memoize uniform, update via onChange
const uniforms = useMemo(() => ({ 
  roughness: uniform(0.5) 
}), [])

useControls({
  roughness: { 
    value: 0.5, 
    onChange: (v) => uniforms.roughness.value = v 
  }
})

material.roughnessNode = uniforms.roughness
```

## WebGPU vs WebGL

### "Feature not supported"

Some TSL features are WebGPU-only:

- Compute shaders (`renderer.compute()`)
- Storage buffers (`StorageBufferAttribute`)
- Storage textures (`StorageTexture`)

Check WebGPU availability:

```tsx
const isWebGPU = navigator.gpu !== undefined

// Fallback pattern
const renderer = isWebGPU 
  ? new THREE.WebGPURenderer()
  : new THREE.WebGLRenderer()
```

## Debugging Tips

### Inspect generated shader

```tsx
// Name your variables for debugging
const noise = fbm(pos).toVar('debugNoise')

// Check console for generated WGSL/GLSL
console.log(material.fragmentNode)
```

### Use .toMonitor() with Leva

```tsx
const value = someCalculation.toVar()
value.toMonitor().label('Computed Value')
```

### Check node type

```tsx
console.log(myNode.nodeType)  // 'float', 'vec3', etc.
```

## Related

- [optimization.md](optimization.md) — Performance anti-patterns
- [syntax.md](syntax.md) — Correct TSL syntax
- [types.md](types.md) — Type conversions

