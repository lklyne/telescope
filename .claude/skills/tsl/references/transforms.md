# Position and Normal Transforms

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides automatic transformation pipelines for positions and normals, optimizing by computing transformations only once through automatic backtracing.

## Position Transformation Pipeline

```
positionGeometry  →  positionLocal  →  positionWorld  →  positionView  →  positionClip
     (raw)            (skinning)         (model)           (camera)        (projection)
```

| Node | Description | GLSL Equivalent | When to Use |
|------|-------------|-----------------|-------------|
| `positionGeometry` | Raw vertex attribute | `position` attribute | Rarely used directly |
| `positionLocal` | After skinning/morphing | `transformed` | Vertex displacement, local space effects |
| `positionWorld` | In world space | `modelMatrix * vec4(transformed, 1.0)` | World-space effects, distance calcs |
| `positionView` | In camera space | `viewMatrix * worldPosition` | View-dependent effects, depth |
| `positionClip` | Projected to screen | `projectionMatrix * viewPosition` | Final vertex position |

## Common Position Patterns

### Vertex Displacement (Local Space)

```tsx
material.positionNode = positionLocal.add(
  normalLocal.mul(noise(positionWorld.mul(0.1)))
)
```

### World-Space Wave

```tsx
const wave = sin(positionWorld.y.mul(2).add(time))
material.positionNode = positionLocal.add(normalLocal.mul(wave))
```

### Distance-Based Effect

```tsx
const distFromOrigin = positionWorld.length()
const scale = distFromOrigin.div(10).oneMinus().max(0)
material.opacityNode = scale
```

## TSL Optimization - Automatic Backtracing

TSL automatically optimizes transformation chains to avoid redundant computation.

```tsx
// Both use positionWorld
const dist = positionWorld.length()
const height = positionWorld.y

// TSL automatically computes positionWorld ONCE
// Even though multiple nodes reference it
// No manual optimization needed!
```

## Normal Transformation Pipeline

```
normalGeometry  →  normalLocal  →  normalWorld  →  normalView
    (raw)          (skinning)       (model)        (camera)
```

### View-Space Normals

```tsx
// View-space normals for lighting
material.normalNode = normalView

// World-space normal displacement
material.normalNode = normalWorld.add(noise3D(positionWorld))
```

## Related

- [optimization.md](optimization.md) - Using .toVar() with transform nodes
- [materials.md](materials.md) - Material node slots
