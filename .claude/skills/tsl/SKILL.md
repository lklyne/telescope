---
name: tsl
description: |
  Expert in Three.js Shading Language (TSL) for node-based shader creation in JavaScript/TypeScript.

  Core capabilities: Material composition (colorNode, roughnessNode, metalnessNode, positionNode,
  normalNode, emissiveNode, backdropNode), shader logic composition (texture sampling, math operations,
  control flow), cross-platform abstraction (WebGL/WebGPU), and React Three Fiber integration.

  Key topics:
  - Array patterns: array(), uniformArray(), instancedArray() for constants, CPU updates, and GPU storage
  - Transform pipelines: positionGeometry→positionLocal→positionWorld→positionView, normalLocal→normalWorld→normalView
  - Coordinate systems: screenUV/screenCoordinate (framebuffer) vs viewportUV/viewportCoordinate (respects setViewport)
  - Function types: inline (pure math), Fn() (control flow), glslFn/wgslFn (platform-specific)
  - Performance: .toVar() caching, uniform memoization, useFrame mutation patterns
  - WebGPU compute: storage buffers, instancedArray, textureStore, compute lifecycle
  - Rendering: MRT (Multiple Render Targets), PostProcessing, pass-based effects, G-buffer patterns
  - Effects: backdropNode for refraction/transmission, viewportSharedTexture for screen-space
  - Lifecycle: onFrameUpdate (per-frame), onRenderUpdate (per-pass), onObjectUpdate (per-mesh)
  - Inspector: .toInput() for Leva controls, .toMonitor() for debugging
  - r3f integration: useMemo for uniforms, Leva onChange patterns, avoid setState in useFrame
  - Noise: MaterialX noise functions (mx_noise_float, mx_worley_noise, mx_fractal_noise)
  - Utilities: color adjustments (luminance, saturation, hue), fog, billboarding, structs, varyings
  - Scene: backgroundNode for custom backgrounds, fogNode for distance fog, lightingModel customization

  Trigger contexts: shader creation, material customization, performance optimization, WebGPU compute,
  post-processing effects, GLSL/WGSL replacement, node-based shading, Three.js r3f projects.

  Reference: https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language for full TSL specification
---

# TSL Expert Mode

> **Last verified:** three.js r182 (0.182.0) — 2026-04-02 | r183 changelog reviewed

**Full docs:** [Three.js Shading Language Wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) | **r3f tips:** `.claude/CLAUDE.md`

## ⚠️ Deprecated — Read First

These cause errors or warnings. Stop using them immediately.

### r181+ Deprecations

| ❌ DO NOT USE                    | ✅ USE INSTEAD                          |
| -------------------------------- | --------------------------------------- |
| `timerGlobal`                    | `time`                                  |
| `timerLocal`                     | `time`                                  |
| `timerDelta`                     | `deltaTime`                             |
| `import from 'three/nodes'`      | `import from 'three/tsl'`               |
| `import * as THREE from 'three'` | `import * as THREE from 'three/webgpu'` |
| `oscSine(timerGlobal)`           | `oscSine(time)` or `oscSine()`          |

### r183+ Breaking Changes

| ❌ DO NOT USE                          | ✅ USE INSTEAD                          |
| -------------------------------------- | --------------------------------------- |
| `new PostProcessing(renderer)`         | `new RenderPipeline(renderer)`          |
| `Line2NodeMaterial.useColor`           | `Line2NodeMaterial.vertexColors`        |
| `scriptable` node                      | Removed — use `Fn()` instead            |
| `THREE.Clock`                          | `THREE.Timer`                           |

**→ Complete deprecations & errors:** [errors.md](references/errors.md)

## Core Philosophy

TSL = shader graph in JS. Write shader logic directly in TypeScript. No string manipulation. Nodes, not GLSL strings. Everything is a Node that composes.

### Build-Time vs Run-Time (Critical Concept)

TSL code executes at **two different times**:

```tsx
// BUILD TIME: JavaScript runs ONCE when shader compiles
// Use for material setup, conditional shader variants
if (material.transparent) {
  return transparentShader // JS conditional, runs once
}

// RUN TIME: TSL executes on GPU every pixel/vertex
// Use for actual shader logic
If(value.greaterThan(0.5), () => {
  result.assign(1.0) // TSL conditional, runs on GPU
})
```

**Rule:** JS `if` = build-time branching (shader variants). TSL `If` = runtime GPU branching.

## Critical Performance Patterns

**Always memoize uniforms** — stable refs prevent frozen shaders:

```tsx
const uniforms = useMemo(
  () => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#ff0') },
  }),
  [],
)
```

**Mutate in useFrame, not setState** — avoid React renders:

```tsx
useFrame((_, delta) => {
  uniforms.uTime.value += delta
})
```

**Leva integration** — onChange mutates `.value`:

```tsx
useControls({
  color: { value: '#ff0', onChange: (v) => uniforms.uColor.value.set(v) },
})
```

**Reuse THREE objects** — `color.set(v)`, `vec.set(x,y,z)` to prevent GC

**→ Full optimization guide:** [optimization.md](references/optimization.md)

## Quick Reference Tables

### Imports (Correct Patterns)

```tsx
// NPM (Preferred)
import * as THREE from 'three/webgpu'
import { Fn, vec3, float, uniform, texture, uv, time } from 'three/tsl'

// CDN
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.webgpu.min.js",
    "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.webgpu.min.js",
    "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.tsl.min.js"
  }
}
</script>
```

### Array Types

| Type               | Use Case      | Size  | Updatable | Details                                                                |
| ------------------ | ------------- | ----- | --------- | ---------------------------------------------------------------------- |
| `array()`          | Constants     | ~100  | No        | [arrays.md](references/arrays.md)                                      |
| `uniformArray()`   | CPU updates   | ~1000 | Yes (CPU) | [arrays.md](references/arrays.md)                                      |
| `attributeArray()` | Per-vertex    | Any   | Yes (CPU) | [arrays.md](references/arrays.md)                                      |
| `instancedArray()` | GPU storage   | 100k+ | Yes (GPU) | [arrays.md](references/arrays.md), [compute.md](references/compute.md) |

### Function Types

| Type            | Control Flow | Platform | Performance | Details                                 |
| --------------- | ------------ | -------- | ----------- | --------------------------------------- |
| Inline `() =>`  | ❌           | Both     | Best        | [functions.md](references/functions.md) |
| `Fn()`          | ✅           | Both     | Good        | [functions.md](references/functions.md) |
| `glslFn/wgslFn` | ✅           | Single   | Best        | [functions.md](references/functions.md) |

### Type Constructors

| Constructor     | Input                          | Output              |
| --------------- | ------------------------------ | ------------------- |
| `float(x)`      | number, node                   | float               |
| `int(x)`        | number, node                   | int                 |
| `uint(x)`       | number, node                   | uint                |
| `bool(x)`       | boolean, node                  | bool                |
| `vec2(x,y)`     | numbers, nodes, Vector2        | vec2                |
| `vec3(x,y,z)`   | numbers, nodes, Vector3, Color | vec3                |
| `vec4(x,y,z,w)` | numbers, nodes, Vector4        | vec4                |
| `color(hex)`    | hex number or string           | vec3                |
| `ivec2/3/4`     | integers                       | signed int vector   |
| `uvec2/3/4`     | integers                       | unsigned int vector |
| `bvec2/3/4`     | booleans                       | boolean vector      |
| `mat2/3/4`      | numbers, Matrix                | matrix              |

**→ Full type system:** [types.md](references/types.md)

### Noise Functions (MaterialX)

| Function                              | Output | Description                    |
| ------------------------------------- | ------ | ------------------------------ |
| `mx_noise_float(pos)`                 | float  | Perlin-style noise             |
| `mx_noise_vec3(pos)`                  | vec3   | 3D vector noise                |
| `mx_noise_vec4(pos)`                  | vec4   | 4D vector noise                |
| `mx_cell_noise_float(pos)`            | float  | Cellular/Voronoi noise         |
| `mx_worley_noise_float(pos)`          | float  | Worley distance noise          |
| `mx_worley_noise_vec2(pos)`           | vec2   | 2D Worley noise                |
| `mx_worley_noise_vec3(pos)`           | vec3   | 3D Worley noise                |
| `mx_fractal_noise_float(pos,oct,lac,dim)` | float | Fractal brownian motion    |
| `mx_fractal_noise_vec3(pos,oct,lac,dim)`  | vec3  | 3D fractal noise           |

```tsx
// Basic Perlin noise
const noise = mx_noise_float(positionWorld.mul(2))

// Fractal noise with octaves
const fbm = mx_fractal_noise_float(positionWorld, 4, 2.0, 0.5)
// args: position, octaves, lacunarity, diminish
```

### Color Adjustments

| Function                  | Description                         |
| ------------------------- | ----------------------------------- |
| `luminance(color)`        | Perceived brightness (float)        |
| `saturation(color, adj)`  | Adjust saturation (>1 more, <1 less)|
| `vibrance(color, adj)`    | Enhance undersaturated colors       |
| `hue(color, adj)`         | Rotate hue (radians)                |
| `posterize(color, steps)` | Reduce color levels                 |
| `grayscale(color)`        | Convert to grayscale                |

```tsx
// Desaturate
material.colorNode = saturation(texture(map), 0.5)

// Posterize for stylized look
material.colorNode = posterize(texture(map), 4)
```

### Bitwise Functions (r182+)

| Function                   | Description                          |
| -------------------------- | ------------------------------------ |
| `countOneBits(x)`          | Count number of 1 bits (popcount)    |
| `countLeadingZeros(x)`     | Count leading zero bits              |
| `countTrailingZeros(x)`    | Count trailing zero bits             |

### Control Flow (Inside Fn())

```tsx
// Conditional (capital I!)
If(a.greaterThan(b), () => {
  result.assign(a)
})
  .ElseIf(a.lessThan(c), () => {
    result.assign(c)
  })
  .Else(() => {
    result.assign(b)
  })

// Ternary alternative (works outside Fn() too!)
const result = select(condition, valueIfTrue, valueIfFalse)

// Loop
Loop(count, ({ i }) => {
  /* i is loop index */
})
Loop({ start: int(0), end: int(10) }, ({ i }) => {})

// Switch
Switch(mode)
  .Case(0, () => {
    out.assign(red)
  })
  .Case(1, () => {
    out.assign(green)
  })
  .Default(() => {
    out.assign(white)
  })
```

**→ Full syntax reference:** [syntax.md](references/syntax.md)

### Material Slots (Basic)

**Core:** `colorNode`, `opacityNode`, `positionNode`, `normalNode`, `emissiveNode`
**PBR:** `roughnessNode`, `metalnessNode`, `aoNode`, `envNode`
**Physical:** `transmissionNode`, `thicknessNode`, `iorNode`, `dispersionNode`, `clearcoatNode`, `sheenNode`, `anisotropyNode`
**Advanced:** `backdropNode`, `fragmentNode`, `outputNode`, `geometryNode`, `lightsNode`
**Shadows:** `castShadowNode`, `receivedShadowNode`, `maskShadowNode`

**→ Complete reference (all material types):** [materials.md](references/materials.md)

### Common Nodes

**Attributes:** `uv()`, `positionLocal/World/View`, `normalLocal/View/World`, `vertexIndex`, `instanceIndex`, `drawIndex`
**Screen:** `screenUV`, `screenCoordinate`, `viewportUV` — [coordinates.md](references/coordinates.md)
**Viewport:** `viewportSharedTexture()`, `viewportDepthTexture()`, `viewportMipTexture()`, `viewportSafeUV()`, `viewportLinearDepth`
**Camera:** `cameraPosition`, `cameraProjectionMatrix`, `cameraProjectionMatrixInverse`, `cameraWorldMatrix`
**Time:** `time` (elapsed seconds), `deltaTime` (frame delta)
**Math:** All GLSL functions as methods — `.sin()`, `.normalize()`, `.mix(a,b)`, `bitcast()`, `transformDirection()`
**Texture:** `texture(map, uv())`, `textureLoad()`, `textureSize()`, `textureBicubic()`, `cubeTexture()`, `triplanarTexture()`
**Mesh:** `batch()` (BatchedMesh), `instance()` (InstancedMesh)

**→ Full shader inputs:** [inputs.md](references/inputs.md)

### Fog Nodes

```tsx
import { fog, rangeFogFactor, densityFogFactor, exponentialHeightFogFactor } from 'three/tsl'

// Linear fog (distance-based)
scene.fogNode = fog(color(0x000000), rangeFogFactor(10, 100))

// Exponential fog (density-based)
scene.fogNode = fog(color(0x888888), densityFogFactor(0.02))

// Exponential height fog (r183+) — fog density varies with height
scene.fogNode = fog(color(0x888888), exponentialHeightFogFactor(0.02, 10))
```

### Varyings & Vertex Stage

```tsx
// Pass data from vertex to fragment shader
const myVarying = varying(expression, 'myVaryingName')

// Force computation in vertex shader (optimization)
const vertexComputed = vertexStage(expensiveCalculation)
```

### Structs

```tsx
// Define struct type
const MyStruct = struct({ position: 'vec3', intensity: 'float' })

// Create instance
const instance = MyStruct(vec3(1, 2, 3), 0.5)
const instance2 = MyStruct({ position: vec3(1), intensity: 0.5 })

// Access fields
const val = instance.get('position')
val.assign(vec3(2, 3, 4))

// Return multiple values from Fn()
return outputStruct(colorNode, normalNode, depthNode)
```

### Billboarding & Utilities

```tsx
// Face camera (all axes)
material.positionNode = billboarding()

// Y-axis only (trees, sprites)
material.positionNode = billboarding({ horizontal: true, vertical: false })

// Checkerboard pattern
const check = checker(uv().mul(10))  // 10x10 grid

// 2D/3D rotation
const rotated2D = rotate(uv(), float(Math.PI / 4))  // rotate UV 45°
const rotated3D = rotate(positionLocal, euler)       // rotate by Euler
```

### Background Nodes

```tsx
// Custom background shader (replaces scene.background)
scene.backgroundNode = texture(envMap, equirectUV())

// Gradient background
scene.backgroundNode = mix(
  color(0x000033),
  color(0x003366),
  screenUV.y
)
```

### Position Transform Pipeline

```
positionGeometry → positionLocal → positionWorld → positionView → positionClip
```

**→ Full pipeline:** [transforms.md](references/transforms.md)

## Essential Workflows

### Basic Material Setup

```tsx
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { texture, uv, uniform } from 'three/tsl'

const material = new MeshStandardNodeMaterial()
material.colorNode = texture(colorMap, uv())
material.roughnessNode = uniform(0.5)
```

### Vertex Displacement

```tsx
// Local space displacement
material.positionNode = positionLocal.add(normalLocal.mul(noise(positionWorld.mul(0.1))))
```

### Texture Sampling

```tsx
// Basic texture (with interpolation)
const color = texture(map, uv())

// Direct texel fetch (no interpolation)
const texel = textureLoad(map, ivec2(x, y))

// Get texture dimensions
const size = textureSize(map)  // ivec2

// Bicubic filtering (higher quality)
const smooth = textureBicubic(map, uv())

// Triplanar mapping
const color = triplanarTexture(map, positionWorld, normalWorld)

// 3D texture sampling
const value = texture3D(vol, uvw)

// Cube map
const env = cubeTexture(envMap, reflectVector)
```

### Performance Optimization

```tsx
// Cache expensive operations with .toVar()
const noise = mx_noise_float(positionWorld.mul(10)).toVar('cachedNoise')
material.colorNode = noise.mul(0.5)
material.roughnessNode = noise.mul(0.3)
```

**→ Full optimization guide:** [optimization.md](references/optimization.md)

### Discard Fragments

```tsx
// Discard pixels conditionally (alpha cutout, etc.)
const myShader = Fn(() => {
  const alpha = texture(map).a

  If(alpha.lessThan(0.5), () => {
    Discard()  // Fragment won't be rendered
  })

  return vec4(color, alpha)
})
```

### Custom Lighting Model

```tsx
// Override default lighting calculations
const customLighting = Fn(({ lightDirection, lightColor, reflectedLight }) => {
  // Custom diffuse calculation
  const NdotL = normalWorld.dot(lightDirection).max(0)
  const toonShading = step(0.5, NdotL)

  reflectedLight.directDiffuse.addAssign(lightColor.mul(toonShading))
})

material.lightingModel = {
  direct: customLighting
}
```

### Context Nodes (r182+)

```tsx
// Built-in shadow context (for custom shadow handling)
builtinShadowContext()

// Built-in AO context (for custom ambient occlusion)
builtinAOContext()

// Renderer reference (access renderer in shader context)
rendererReference
```

### Tangent Attributes (r182+)

**Note:** Tangent attributes are no longer auto-generated. You must explicitly provide them if needed:

```tsx
// Compute tangents before using normal maps
geometry.computeTangents()

// Or use MikkTSpace tangent generation for best quality
```

### Leva Inspector

```tsx
// Auto-generate Leva controls
material.roughnessNode = uniform(0.5).toInput('range', { min: 0, max: 1 })
material.colorNode = uniform(new THREE.Color('#ff0')).toInput('color')
```

**→ All input types:** [inspector.md](references/inspector.md)

## Reference Library

### Fundamentals

- **[syntax.md](references/syntax.md)** — Operators, control flow, variables, loops
- **[types.md](references/types.md)** — All constructors and type conversions
- **[inputs.md](references/inputs.md)** — Complete shader inputs reference
- **[arrays.md](references/arrays.md)** — array(), uniformArray(), instancedArray() patterns
- **[transforms.md](references/transforms.md)** — Position/normal transformation pipelines
- **[coordinates.md](references/coordinates.md)** — Screen vs viewport coordinate systems
- **[functions.md](references/functions.md)** — Fn(), inline, glslFn/wgslFn patterns
- **[materials.md](references/materials.md)** — Complete material node slots reference

### Utilities & Patterns

- **[utilities.md](references/utilities.md)** — Oscillators, blend modes, UV utilities
- **[patterns.md](references/patterns.md)** — Common shader patterns (fresnel, gradients, etc.)

### Performance

- **[optimization.md](references/optimization.md)** — .toVar(), memoization, r3f patterns

### Rendering

- **[compute.md](references/compute.md)** — Storage buffers, compute shaders, WebGPU
- **[rendering.md](references/rendering.md)** — MRT, post-processing, G-buffer, passes
- **[effects.md](references/effects.md)** — backdropNode, refraction, transmission

### Integration & Debug

- **[inspector.md](references/inspector.md)** — Leva integration, .toInput(), .toMonitor()
- **[lifecycle.md](references/lifecycle.md)** — onFrameUpdate, onRenderUpdate, onObjectUpdate
- **[errors.md](references/errors.md)** — Common errors and solutions

## GLSL → TSL Migration

### Position & Normals

| GLSL                | TSL                |
| ------------------- | ------------------ |
| `position`          | `positionGeometry` |
| `transformed`       | `positionLocal`    |
| `transformedNormal` | `normalLocal`      |
| `vWorldPosition`    | `positionWorld`    |
| `vNormal`           | `normalView`       |

### Matrices

| GLSL               | TSL                      |
| ------------------ | ------------------------ |
| `viewMatrix`       | `cameraViewMatrix`       |
| `modelMatrix`      | `modelWorldMatrix`       |
| `modelViewMatrix`  | `modelViewMatrix`        |
| `projectionMatrix` | `cameraProjectionMatrix` |
| `normalMatrix`     | `modelNormalMatrix`      |

### Textures & Color

| GLSL                    | TSL                     |
| ----------------------- | ----------------------- |
| `texture2D(tex, uv)`    | `texture(tex, uv)`      |
| `textureCube(tex, dir)` | `cubeTexture(tex, dir)` |
| `diffuseColor`          | `material.colorNode`    |
| `gl_FragColor`          | `material.fragmentNode` |

### Built-ins

| GLSL            | TSL                               |
| --------------- | --------------------------------- |
| `gl_FragCoord`  | `screenCoordinate`                |
| `gl_PointCoord` | `uv()` in Sprite/Points materials |
| `gl_InstanceID` | `instanceIndex`                   |
| `vUv` / `uv`    | `uv()`                            |
| `vColor`        | `vertexColor()`                   |

**Types:** `float()`, `vec2/3/4()`, `color()`, `uniform()`, `texture()`
**Swizzle:** `.xyz`, `.rgb`, `.xy` — GLSL-style accessors work

## Anti-Patterns

- ❌ `new THREE.Color()` in useFrame → ✅ memoize, mutate with `.set()`
- ❌ `setState` with uniform values → ✅ mutate `uniform.value` directly
- ❌ Recreating uniforms object → ✅ `useMemo` once, mutate `.value`
- ❌ React state values in TSL ops → ✅ wrap with `TSL.float()`/`TSL.vec2()` etc ([optimization.md](references/optimization.md#react-state-values-in-tsl-graphs))
- ❌ String GLSL injection → ✅ Use TSL nodes exclusively
- ❌ `.onBeforeCompile` hacks → ✅ Use material node slots
- ❌ lowercase `if()` in TSL → ✅ Use capital `If()` for GPU conditionals
- ❌ Rendering before init → ✅ `await renderer.init()` first

## When Stuck

1. Check the [Three.js Shading Language Wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) for node documentation
2. Verify uniform memoization — #1 cause of "frozen" shaders
3. Use `.toVar('debugName')` to inspect values in generated shader
4. Check [errors.md](references/errors.md) for common error patterns
5. Remember: everything chains, everything composes, no string manipulation
