# Performance Optimization in TSL

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL with React Three Fiber requires specific patterns to avoid performance pitfalls, particularly around uniform management and shader caching.

## r3f + TSL Specific Rules

- Pre-create node graphs/materials — mutate uniforms only in useFrame
- Avoid rebuilding nodes per frame — memoize inputs with useMemo
- Share materials/geometries across instances
- No `new THREE.*` in useFrame — hoist or memoize
- No setState in loops/useFrame/fast events — mutate refs, use delta

## React State Values in TSL Graphs

**Critical:** When building TSL node graphs inside `useEffect` with dependencies on React state (e.g., from `useControls`), you MUST wrap JavaScript values with TSL type constructors before using them in TSL operations.

### The Problem

```tsx
// ❌ BAD - JavaScript values used directly in TSL operations
const { pixelSize, maskIntensity, blending } = useControls({
  pixelSize: { value: 4, options: [1, 2, 4, 8] },
  maskIntensity: { value: 0.6, min: 0, max: 1 },
  blending: { value: true }
})

useEffect(() => {
  // pixelSize is a JS number, not a TSL node!
  const coord = pixel.div(pixelSize)  // ⚠️ May cause type errors

  // maskIntensity is a JS number
  const masked = color.mul(maskIntensity)  // ⚠️ May cause type errors

  // blending is a JS boolean
  const blendAmount = blending ? 1.0 : 0.0  // ⚠️ JS number in TSL operation
  const result = TSL.mix(a, b, blendAmount)  // ❌ ERROR: expects TSL node
}, [pixelSize, maskIntensity, blending])
```

### The Solution

Always wrap React state values with appropriate TSL constructors at the top of your effect:

```tsx
// ✅ GOOD - React state wrapped in TSL nodes
const { pixelSize, maskIntensity, blending } = useControls({
  pixelSize: { value: 4, options: [1, 2, 4, 8] },
  maskIntensity: { value: 0.6, min: 0, max: 1 },
  blending: { value: true }
})

useEffect(() => {
  // Convert React state to TSL nodes FIRST
  const pixelSizeTSL = TSL.float(pixelSize)
  const maskIntensityTSL = TSL.float(maskIntensity)
  const blendingTSL = TSL.float(blending ? 1.0 : 0.0)

  // Now use TSL nodes in operations
  const coord = pixel.div(pixelSizeTSL)  // ✅ TSL float
  const masked = color.mul(maskIntensityTSL)  // ✅ TSL float
  const result = TSL.mix(a, b, blendingTSL)  // ✅ TSL float
}, [pixelSize, maskIntensity, blending])
```

### Type Constructor Reference

| React State Type | TSL Constructor | Example |
| --- | --- | --- |
| `number` | `TSL.float(x)` | `TSL.float(pixelSize)` |
| `boolean` | `TSL.float(b ? 1.0 : 0.0)` | `TSL.float(enabled ? 1.0 : 0.0)` |
| `[x, y]` | `TSL.vec2(x, y)` | `TSL.vec2(offset[0], offset[1])` |
| `[x, y, z]` | `TSL.vec3(x, y, z)` | `TSL.vec3(...position)` |
| `'#ff0000'` | `TSL.color(str)` | `TSL.color(colorHex)` |
| `THREE.Color` | `TSL.color(col)` | `TSL.color(colorObj)` |

### When to Wrap

- ✅ **Always wrap** when using `TSL.mix()`, `TSL.step()`, `TSL.smoothstep()` - these expect TSL nodes
- ✅ **Always wrap** when React state drives shader logic (pixel size, intensity, threshold)
- ✅ **Best practice**: wrap at the top of your effect for consistency
- ⚠️ **May auto-convert**: basic math operations like `.mul()`, `.add()` sometimes work with JS numbers, but explicit wrapping is safer
- ❌ **Never wrap**: values already created as TSL nodes (e.g., `uniform()`, `texture()`)

### Common Patterns

```tsx
// Post-processing with Leva controls
const { threshold, intensity, radius } = useControls('Effect', {
  threshold: { value: 0.5, min: 0, max: 1 },
  intensity: { value: 1.0, min: 0, max: 3 },
  radius: { value: 0.5, min: 0, max: 2 }
})

useEffect(() => {
  // Wrap all controls at the top
  const thresholdTSL = TSL.float(threshold)
  const intensityTSL = TSL.float(intensity)
  const radiusTSL = TSL.float(radius)

  // Build graph with TSL nodes
  const bright = TSL.step(thresholdTSL, luminance)
  const scaled = bright.mul(intensityTSL)
  const blurred = blur(scaled, radiusTSL)

  postProcessing.outputNode = blurred
}, [threshold, intensity, radius])
```

## Shader Optimization

- `vertexStage()` for expensive calcs — interpolate result to fragment
- `.toVar()` for manual caching of repeated expressions
- TSL auto-optimizes: reuses varyings, deduplicates uniforms, polyfills WGSL/GLSL quirks

## Manual Optimization - .toVar and .toConst

### When to Cache

Use `.toVar()` for expensive operations that are used multiple times.

```tsx
// ❌ Without toVar - computed 3 times!
const noise = noise3D(positionWorld.mul(10))
material.colorNode = noise.mul(0.5)
material.roughnessNode = noise.mul(0.3)
material.opacityNode = noise

// ✅ With toVar - computed once, cached in variable
const noise = noise3D(positionWorld.mul(10)).toVar()
material.colorNode = noise.mul(0.5)
material.roughnessNode = noise.mul(0.3)
material.opacityNode = noise
```

### Named Variables for Debugging

```tsx
const noise = noise3D(positionWorld.mul(10)).toVar('cachedNoise')
const fresnel = normalView.dot(viewDir).toVar('fresnelValue')

// Shows in generated shader as:
// float cachedNoise = noise3D(...);
// float fresnelValue = dot(...);
```

### .toConst() - Inline Constant

```tsx
// toConst - inlined, no variable created
const scale = float(2.5).toConst()
const offset = vec3(1, 0, 0).toConst()

// Used for compile-time constants that won't change
```

### When to Use .toVar()

- ✅ Expensive operations (noise, fbm, complex math)
- ✅ Used in multiple material slots
- ✅ Used multiple times in same function
- ❌ Simple operations (add, mul, swizzle)
- ❌ Only used once

## Complex Shader with Caching

```tsx
// Expensive calculations cached once
const worldNoise = noise3D(positionWorld.mul(5)).toVar('worldNoise')
const fbmValue = fbm(positionWorld).toVar('fbmValue')

// Reuse cached values
const displacement = worldNoise.add(fbmValue).mul(0.5)
const colorVariation = worldNoise.mul(0.3)
const roughnessVar = fbmValue.oneMinus()

material.positionNode = positionLocal.add(normalLocal.mul(displacement))
material.colorNode = baseColor.add(colorVariation)
material.roughnessNode = roughnessVar
```

## Leva Integration with Memoization

Critical pattern to prevent "frozen" shaders:

```tsx
// ⚠️ Must memoize uniforms object to prevent stale references
const uniforms = useMemo(() => ({
  noiseScale: uniform(10).toInput('range', { min: 1, max: 50 }),
  color: uniform(new THREE.Color('#ff0')).toInput('color')
}), [])

// Cache expensive operation
const noise = noise3D(positionWorld.mul(uniforms.noiseScale)).toVar()

// Leva onChange mutates uniform.value directly
useControls({
  customScale: {
    value: 10,
    onChange: (v) => uniforms.noiseScale.value = v
  }
})
```

## WebGPU Compute Optimization

- Batch compute calls — minimize threadgroup divergence
- Use half-res textures for post when acceptable
- Cap DPR on mobile (max 2x, prefer 1.5x)

## Related

- [inspector.md](inspector.md) - Leva integration patterns
- [lifecycle.md](lifecycle.md) - When to update uniforms
- [compute.md](compute.md) - GPU compute optimization
