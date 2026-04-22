# Shader Inputs Reference

**Back to:** [SKILL.md](../SKILL.md)

## Overview

Complete reference for all TSL shader input nodes — positions, normals, camera, screen, time, and attributes.

## Position Nodes

| Node | Space | Description | Common Use |
|------|-------|-------------|------------|
| `positionGeometry` | Object | Raw vertex attribute | Rarely used directly |
| `positionLocal` | Object | After skinning/morphing | Vertex displacement |
| `positionWorld` | World | In world space | World effects, noise |
| `positionView` | View | In camera space | Depth effects |
| `positionClip` | Clip | Projected to screen | Final vertex position |
| `clipSpace` | Clip | Clip-space coordinates (r183+) | Custom clip operations |

### Direction Variants

| Node | Description |
|------|-------------|
| `positionWorldDirection` | Normalized world position direction |
| `positionViewDirection` | Normalized view position direction |

## Normal Nodes

| Node | Space | Description |
|------|-------|-------------|
| `normalGeometry` | Object | Raw normal attribute |
| `normalLocal` | Object | After skinning/morphing |
| `normalWorld` | World | World-space normal |
| `normalView` | View | View-space normal (for lighting) |
| `normalViewGeometry` | View | View-space geometry normal (no normal map) |
| `normalWorldGeometry` | World | World-space geometry normal (no normal map) |
| `transformedNormalView` | View | Final transformed normal |

## Tangent & Bitangent Nodes

Used for normal mapping and anisotropic effects.

| Node | Space | Description |
|------|-------|-------------|
| `tangentGeometry` | Object | Raw tangent attribute |
| `tangentLocal` | Object | After skinning/morphing |
| `tangentWorld` | World | World-space tangent |
| `tangentView` | View | View-space tangent |
| `bitangentGeometry` | Object | Computed from normal × tangent |
| `bitangentLocal` | Object | After skinning/morphing |
| `bitangentWorld` | World | World-space bitangent |
| `bitangentView` | View | View-space bitangent |

## Camera Nodes

| Node | Type | Description |
|------|------|-------------|
| `cameraPosition` | vec3 | Camera world position |
| `cameraNear` | float | Near clipping plane |
| `cameraFar` | float | Far clipping plane |
| `cameraViewMatrix` | mat4 | View matrix |
| `cameraProjectionMatrix` | mat4 | Projection matrix |
| `cameraProjectionMatrixInverse` | mat4 | Inverse projection matrix |
| `cameraWorldMatrix` | mat4 | Camera world matrix |
| `cameraNormalMatrix` | mat3 | Camera normal matrix |

## Screen & Viewport Nodes

### Screen (Full Framebuffer)

| Node | Type | Description |
|------|------|-------------|
| `screenUV` | vec2 | Normalized [0,1] screen coordinates |
| `screenCoordinate` | vec2 | Physical pixel coordinates |
| `screenSize` | vec2 | Framebuffer size in pixels |
| `screenDPR` | float | Device pixel ratio |

### Viewport (Respects setViewport)

| Node | Type | Description |
|------|------|-------------|
| `viewportUV` | vec2 | Normalized [0,1] within viewport |
| `viewportCoordinate` | vec2 | Pixel coordinates within viewport |
| `viewportSize` | vec2 | Viewport size in pixels |
| `viewport` | vec4 | Viewport bounds (x, y, width, height) |
| `viewportSharedTexture()` | vec4 | Access previously rendered content (for refraction) |
| `viewportDepthTexture()` | float | Depth texture from current viewport |
| `viewportLinearDepth` | float | Linear depth value (0=near, 1=far) |
| `viewportMipTexture()` | vec4 | Mipmap-enabled viewport texture |
| `viewportSafeUV()` | vec2 | Safe UV for refraction (avoids edge artifacts) |

**→ Detailed guide:** [coordinates.md](coordinates.md)

## Time Nodes

| Node | Type | Description |
|------|------|-------------|
| `time` | float | Elapsed time in seconds |
| `deltaTime` | float | Time since last frame |

**⚠️ Deprecated:** `timerGlobal`, `timerLocal`, `timerDelta` — use `time` and `deltaTime`

## Model Nodes

| Node | Type | Description |
|------|------|-------------|
| `modelDirection` | vec3 | Model forward direction |
| `modelViewMatrix` | mat4 | Model-view matrix |
| `modelNormalMatrix` | mat3 | Model normal matrix |
| `modelWorldMatrix` | mat4 | Model world matrix |
| `modelPosition` | vec3 | Model world position |
| `modelScale` | vec3 | Model scale |
| `modelViewPosition` | vec3 | Model position in view space |
| `modelWorldMatrixInverse` | mat4 | Inverse model world matrix |
| `highpModelViewMatrix` | mat4 | High-precision model-view matrix |
| `highpModelNormalViewMatrix` | mat3 | High-precision model normal-view matrix |

## Texture Coordinates

| Node | Description |
|------|-------------|
| `uv()` | Default UV coordinates (channel 0) |
| `uv(index)` | Specific UV channel |
| `matcapUV` | Matcap texture coordinates |

## Attributes

| Node | Description |
|------|-------------|
| `vertexColor()` | Vertex colors (requires geometry to have colors) |
| `attribute('name', 'type')` | Custom vertex attribute |
| `instanceIndex` | Instance/thread ID (for instancing and compute) |
| `vertexIndex` | Vertex index in current mesh |
| `drawIndex` | Multi-draw index (for BatchedMesh) |
| `batch()` | Access BatchedMesh data |
| `instance()` | Access InstancedMesh data |

### Custom Attributes Example

```tsx
// Read custom attribute from geometry
geometry.setAttribute('customData', new THREE.BufferAttribute(data, 3))

// Access in TSL
const customData = attribute('customData', 'vec3')
material.colorNode = customData
```

## Reflect & Refract

| Node | Description |
|------|-------------|
| `reflectView` | Reflection vector in view space |
| `reflectVector` | Reflection vector in world space |

## Depth

| Node | Description |
|------|-------------|
| `viewportDepth` | Depth value for G-buffer/MRT |
| `depth` | Raw depth value |

## Common Patterns

### View Direction for Fresnel

```tsx
const viewDir = cameraPosition.sub(positionWorld).normalize()
const NdotV = normalWorld.dot(viewDir).max(0)
const fresnel = float(1).sub(NdotV).pow(5)
```

### Instance-Based Variation

```tsx
const hue = instanceIndex.toFloat().mul(0.1)
material.colorNode = vec3(hue, 0.8, 0.6)
```

### Screen-Space Effects

```tsx
const vignette = screenUV.sub(0.5).length().oneMinus()
material.colorNode = baseColor.mul(vignette)
```

## Related

- [coordinates.md](coordinates.md) — Screen vs viewport in detail
- [transforms.md](transforms.md) — Position transformation pipeline
- [materials.md](materials.md) — Using inputs in material slots

