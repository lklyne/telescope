# Function Patterns in TSL

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides multiple function types for different use cases, from simple pure expressions to platform-specific native shader code.

## When to Use Each Function Type

| Type | Use Case | Control Flow | Cross-Platform | Performance |
|------|----------|--------------|----------------|-------------|
| Inline arrow | Pure math expressions | ❌ No | ✅ Yes | Best (inlined) |
| `Fn()` | Control flow, assignments | ✅ Yes (If/Loop) | ✅ Yes | Good |
| `tslFn` | Alternative to Fn() | ✅ Yes | ✅ Yes | Good |
| `glslFn`/`wgslFn` | Native shader code | ✅ Yes | ❌ No | Best (native) |

## Inline Functions (Pure Expressions Only)

Best for simple math operations that get inlined by the compiler.

```tsx
// Best for simple math - gets inlined
const oscSine = (t = time) => t.add(0.75).mul(Math.PI * 2).sin()
const fresnel = (normal, viewDir) => normal.dot(viewDir).oneMinus()
const remap01 = (x, min, max) => x.sub(min).div(max.sub(min))

// ❌ Can't use control flow
// const bad = (x) => If(x.greaterThan(0), () => x) // Error!
```

**Use for:**
- Simple math operations
- Pure functions with no side effects
- One-liner expressions

## Fn() - TSL Function (Control Flow Enabled)

Use when you need If/Loop/assignments or access to render context.

### Array Parameters

```tsx
const myFn = Fn(([a, b, c]) => {
  return a.add(b).mul(c)
})

// Call with positional args
myFn(valueA, valueB, valueC)
```

### Object Parameters (Named)

```tsx
const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => {
  return color.mul(intensity)
})

// Call with named args
myFn({ color: red, intensity: 2.0 })
myFn({})  // Uses defaults
```

### With Defaults

```tsx
const animated = Fn(([t = time]) => {
  return t.sin()
})

animated()      // Uses time
animated(phase) // Uses custom value
```

### Access Build Context

The second parameter (or first if no inputs) provides build-time context:

```tsx
const myFn = Fn(([input], { material, geometry, object, camera }) => {
  // These are JS conditionals - run at BUILD time
  if (material.transparent) {
    return input.mul(0.5)
  }
  return input
})

// Context includes:
// - material: The material being compiled
// - geometry: The geometry
// - object: The 3D object
// - camera: The camera
// - renderer: The renderer
```

### Control Flow in Fn()

```tsx
const clampPos = Fn(({ position }) => {
  const result = vec3(position).toVar()
  
  If(result.y.greaterThan(10), () => { 
    result.y.assign(10) 
  }).ElseIf(result.y.lessThan(0), () => {
    result.y.assign(0)
  })
  
  return result
})
```

### Immediately Invoked

For material nodes, invoke immediately with `()`:

```tsx
// Create and invoke
material.colorNode = Fn(() => {
  const color = vec3(1, 0, 0).toVar()
  If(condition, () => { color.assign(vec3(0, 1, 0)) })
  return color
})()  // <-- Note the ()
```

### For Compute Shaders

Add `.compute(count)` for standalone compute:

```tsx
const computeShader = Fn(() => {
  const idx = instanceIndex
  buffer.element(idx).assign(newValue)
})().compute(particleCount)
```

## glslFn/wgslFn - Native Shader Code

Drop to GLSL/WGSL for clarity or when porting existing shaders.

```tsx
import { glslFn, wgslFn } from 'three/tsl'

// GLSL function
const colorFn = glslFn(/* glsl */`
  vec4 colorFn(vec4 base, vec2 uv) {
    return mix(base, vec4(uv.x, uv.y, 0.5, 1.0), 0.5);
  }
`)

material.colorNode = colorFn(texture(map), uv())

// WGSL function (WebGPU only)
const wgslEffect = wgslFn(/* wgsl */`
  fn wgslEffect(color: vec4f, intensity: f32) -> vec4f {
    return color * intensity;
  }
`)
```

### ⚠️ Tradeoffs

```tsx
// ❌ Loses cross-platform benefit - won't work on both WebGPU/WebGL
// ✅ Use only when:
//    - Performance hotspot requiring hand-optimized code
//    - Complex algorithm easier to express in GLSL/WGSL
//    - Porting existing shader code
```

## Function Patterns

### Reusable Shader Function

```tsx
// Define once
const fresnel = Fn(({ power = 5 }) => {
  const viewDir = cameraPosition.sub(positionWorld).normalize()
  const NdotV = normalWorld.dot(viewDir).max(0)
  return float(1).sub(NdotV).pow(power)
})

// Use in multiple materials
materialA.emissiveNode = fresnel({ power: 3 }).mul(color(0x00ffff))
materialB.opacityNode = fresnel({ power: 2 })
```

### Composable Functions

```tsx
const noise = (pos, scale = 1) => mx_noise_float(pos.mul(scale))
const fbm = (pos, octaves = 4) => {
  // Returns accumulated noise
  // ...
}

// Compose
const displacement = noise(positionWorld, 5).add(fbm(positionWorld, 3))
```

### Build-Time Variants

```tsx
const adaptiveShader = Fn(([input], { material }) => {
  // JS conditional = build-time variant
  if (material.userData.highQuality) {
    return expensiveCalculation(input)
  }
  return fastApproximation(input)
})

// Creates different compiled shaders based on material.userData
```

## Common Mistakes

### Forgetting to Invoke

```tsx
// ❌ WRONG: Missing () - assigns function, not result
material.colorNode = Fn(() => { return vec3(1, 0, 0) })

// ✅ CORRECT: Invoke immediately
material.colorNode = Fn(() => { return vec3(1, 0, 0) })()
```

### Control Flow Outside Fn()

```tsx
// ❌ WRONG: If requires Fn() context
material.colorNode = If(condition, () => red).Else(() => blue)

// ✅ CORRECT: Wrap in Fn()
material.colorNode = Fn(() => {
  return select(condition, red, blue)
})()

// ✅ BETTER: Use select() which works without Fn()
material.colorNode = select(condition, red, blue)
```

## Related

- [syntax.md](syntax.md) — Control flow syntax (If, Loop, select)
- [optimization.md](optimization.md) — Performance considerations for functions
- [compute.md](compute.md) — Using Fn() for compute shaders
