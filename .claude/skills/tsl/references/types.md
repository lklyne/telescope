# Type System Reference

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides type constructors for all GLSL/WGSL types plus automatic conversions. All constructors accept numbers, nodes, or Three.js objects.

## Scalar Constructors

| Constructor | Input Types | Output |
|-------------|-------------|--------|
| `float(x)` | number, node | float |
| `int(x)` | number, node | int |
| `uint(x)` | number, node | uint |
| `bool(x)` | boolean, node | bool |

```tsx
const f = float(0.5)
const i = int(10)
const u = uint(255)
const b = bool(true)

// From nodes
const fromNode = float(someIntNode)
```

## Vector Constructors

### Float Vectors

| Constructor | Components | Input Types |
|-------------|------------|-------------|
| `vec2(x, y)` | 2 | numbers, nodes, Vector2 |
| `vec3(x, y, z)` | 3 | numbers, nodes, Vector3, Color |
| `vec4(x, y, z, w)` | 4 | numbers, nodes, Vector4 |

```tsx
// From numbers
const v2 = vec2(1, 2)
const v3 = vec3(1, 2, 3)
const v4 = vec4(1, 2, 3, 4)

// From Three.js objects
const v3 = vec3(new THREE.Vector3(1, 2, 3))
const v3 = vec3(new THREE.Color('#ff0'))

// Broadcast (fill all components)
const v3 = vec3(0.5)  // vec3(0.5, 0.5, 0.5)

// From smaller vectors
const v4 = vec4(v3, 1.0)  // Append w component
const v3 = vec3(v2, 0.5)  // Append z component
```

### Integer Vectors

| Constructor | Components |
|-------------|------------|
| `ivec2(x, y)` | 2 signed ints |
| `ivec3(x, y, z)` | 3 signed ints |
| `ivec4(x, y, z, w)` | 4 signed ints |

```tsx
const iv = ivec3(1, 2, 3)
```

### Unsigned Integer Vectors

| Constructor | Components |
|-------------|------------|
| `uvec2(x, y)` | 2 unsigned ints |
| `uvec3(x, y, z)` | 3 unsigned ints |
| `uvec4(x, y, z, w)` | 4 unsigned ints |

```tsx
const uv = uvec2(0, 255)
```

## Color Constructor

```tsx
// From hex number
const c = color(0xff0000)  // Red

// From hex string
const c = color('#ff0000')
const c = color('#f00')

// From RGB (0-1 range)
const c = color(1, 0, 0)

// From Three.js Color
const c = color(new THREE.Color('hotpink'))
```

## Matrix Constructors

| Constructor | Size |
|-------------|------|
| `mat2(...)` | 2×2 matrix |
| `mat3(...)` | 3×3 matrix |
| `mat4(...)` | 4×4 matrix |

```tsx
// From Three.js Matrix
const m = mat4(new THREE.Matrix4())

// Identity
const m = mat3()
```

## Type Conversions

Convert between types using methods:

```tsx
node.toFloat()   // → float
node.toInt()     // → int
node.toUint()    // → uint
node.toBool()    // → bool
node.toVec2()    // → vec2
node.toVec3()    // → vec3
node.toVec4()    // → vec4
node.toColor()   // → color (vec3)
```

### Common Conversion Patterns

```tsx
// Int to float for math
const floatVal = intNode.toFloat()

// Float to int for indexing
const index = floatNode.toInt()

// Vec4 to vec3 (drop alpha)
const rgb = vec4Node.toVec3()  // or .xyz

// Vec3 to vec4 (add alpha)
const rgba = vec4(vec3Node, 1.0)
```

## Uniform Constructor

```tsx
// Create updatable uniform
const u = uniform(initialValue)

// From various types
const uFloat = uniform(0.5)
const uVec3 = uniform(new THREE.Vector3(1, 2, 3))
const uColor = uniform(new THREE.Color('#ff0'))
const uMat4 = uniform(new THREE.Matrix4())

// Update from JavaScript
uFloat.value = 1.0
uColor.value.set('#00f')
```

### Auto-Update Pattern

Use `.onUpdate()` for self-animating uniforms (alternative to useFrame mutation):

```tsx
// Auto-updates every frame
const uTime = uniform(0).onUpdate((node, frame) => {
  node.value = frame.time
})

// No useFrame needed - uniform updates itself
material.colorNode = oscSine(uTime)
```

## Texture Node

```tsx
// Basic texture sampling
const tex = texture(textureObject)
const tex = texture(textureObject, customUV)
const tex = texture(textureObject, uv(), mipLevel)

// Returns vec4 (RGBA)
const rgb = texture(map).rgb
const alpha = texture(map).a
```

## React State to TSL

When using React state in TSL operations, wrap with constructors:

```tsx
const { pixelSize, intensity } = useControls({
  pixelSize: 4,
  intensity: 0.5
})

useEffect(() => {
  // ❌ BAD: JS number used in TSL
  const bad = pixel.div(pixelSize)
  
  // ✅ GOOD: Wrapped in TSL constructor
  const good = pixel.div(float(pixelSize))
  const intensity = float(intensity)
}, [pixelSize, intensity])
```

| React Type | TSL Constructor |
|------------|-----------------|
| `number` | `float(x)` |
| `boolean` | `float(b ? 1.0 : 0.0)` |
| `[x, y]` | `vec2(x, y)` |
| `[x, y, z]` | `vec3(x, y, z)` |
| `'#ff0000'` | `color(str)` |
| `THREE.Color` | `color(col)` |

## Type Checking

```tsx
// Check node type
node.nodeType  // 'float', 'vec3', etc.

// Useful for debugging
console.log(myNode.nodeType)
```

## Related

- [syntax.md](syntax.md) — Operators and operations
- [optimization.md](optimization.md) — React state wrapping patterns
- [inputs.md](inputs.md) — Built-in input node types

