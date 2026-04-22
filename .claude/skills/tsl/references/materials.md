# Material Node Slots

**Back to:** [SKILL.md](../SKILL.md)

## Overview

Complete reference for all TSL material types and their node slots. All node materials extend their classic counterparts with composable node inputs.

## Available Material Types

| Material | Use Case | Lighting |
|----------|----------|----------|
| `MeshBasicNodeMaterial` | Unlit, fastest | None |
| `MeshStandardNodeMaterial` | PBR with roughness/metalness | PBR |
| `MeshPhysicalNodeMaterial` | PBR + advanced effects | PBR+ |
| `MeshPhongNodeMaterial` | Blinn-Phong shading | Blinn-Phong |
| `MeshLambertNodeMaterial` | Lambert diffuse | Diffuse |
| `MeshToonNodeMaterial` | Cel-shaded | Toon |
| `MeshMatcapNodeMaterial` | Matcap shading | Matcap |
| `MeshNormalNodeMaterial` | Visualize normals | Debug |
| `SpriteNodeMaterial` | Billboarded quads | Unlit |
| `PointsNodeMaterial` | Point clouds | Unlit |
| `LineBasicNodeMaterial` | Solid lines | Unlit |
| `LineDashedNodeMaterial` | Dashed lines | Unlit |

## Common Slots (All Materials)

### Core

| Slot | Type | Description |
|------|------|-------------|
| `colorNode` | vec3/vec4 | Base color/albedo |
| `opacityNode` | float | Transparency (0-1) |
| `positionNode` | vec3 | Vertex position (local space) |
| `normalNode` | vec3 | Surface normal |
| `depthNode` | float | Custom depth output |
| `alphaTestNode` | float | Discard threshold (pixels below are discarded) |

### Override

| Slot | Type | Description |
|------|------|-------------|
| `outputNode` | vec4 | Final output override |
| `fragmentNode` | vec4 | Replace entire fragment stage |
| `vertexNode` | vec4 | Replace entire vertex stage |
| `geometryNode` | Fn() | Process geometry before rendering |
| `lightsNode` | Node | Override lighting model |
| `maskNode` | bool | Material mask (discard without alpha) |
| `mrtNode` | mrt() | Custom MRT output definition |

### Shadows

| Slot | Type | Description |
|------|------|-------------|
| `castShadowNode` | vec4 | Control projected shadow color/opacity |
| `maskShadowNode` | float | Shadow mask (control shadow visibility) |
| `receivedShadowNode` | Fn() | Handle shadow cast on material |
| `receivedShadowPositionNode` | vec3 | Shadow projection position (world) |

## MeshStandardNodeMaterial

PBR material with roughness/metalness workflow.

```tsx
import { MeshStandardNodeMaterial } from 'three/webgpu'

const material = new MeshStandardNodeMaterial()
```

### Basic Slots

| Slot | Type | Description | Example |
|------|------|-------------|---------|
| `colorNode` | vec3/vec4 | Base color/albedo | `texture(map).rgb` |
| `opacityNode` | float | Transparency | `float(0.5)` |
| `normalNode` | vec3 | Normal direction | `normalView` |
| `emissiveNode` | vec3 | Glow/emission | `vec3(1,1,0).mul(2)` |
| `positionNode` | vec3 | Vertex position | `positionLocal.add(disp)` |

### PBR Slots

| Slot | Type | Description | Example |
|------|------|-------------|---------|
| `roughnessNode` | float | Surface roughness | `float(0.5)` |
| `metalnessNode` | float | Metallic property | `float(1.0)` |
| `aoNode` | float | Ambient occlusion | `texture(aoMap).r` |
| `envNode` | vec3 | Environment reflection | `cubeTexture(envMap)` |

### Advanced Slots

| Slot | Type | Description | Example |
|------|------|-------------|---------|
| `backdropNode` | vec3/vec4 | Transmission/refraction | `viewportSharedTexture(screenUV)` |
| `backdropAlphaNode` | float | Backdrop blend amount | `float(0.5)` |
| `fragmentNode` | vec4 | Override fragment output | `vec4(color, alpha)` |
| `outputNode` | vec4 | Final output override | `vec4(finalColor, 1.0)` |

## MeshPhysicalNodeMaterial

Extends MeshStandardNodeMaterial with advanced physical properties.

```tsx
import { MeshPhysicalNodeMaterial } from 'three/webgpu'

const material = new MeshPhysicalNodeMaterial()
```

### Additional Physical Slots

| Slot/Property | Type | Description |
|---------------|------|-------------|
| `transmissionNode` | float | Transparency with refraction (0-1) |
| `thicknessNode` | float | Material thickness for transmission |
| `iorNode` | float | Index of refraction (1.5 = glass) |
| `attenuationDistanceNode` | float | Distance light travels through material |
| `attenuationColorNode` | vec3 | Color tint for transmitted light |
| `clearcoatNode` | float | Clear coat layer intensity |
| `clearcoatRoughnessNode` | float | Clear coat roughness |
| `clearcoatNormalNode` | vec3 | Clear coat normal |
| `sheenNode` | float | Fabric sheen intensity |
| `sheenColorNode` | vec3 | Sheen color |
| `sheenRoughnessNode` | float | Sheen roughness |
| `iridescenceNode` | float | Iridescent effect intensity |
| `iridescenceIORNode` | float | Iridescence IOR |
| `iridescenceThicknessNode` | float | Iridescence thin-film thickness |
| `anisotropyNode` | vec2 | Anisotropic reflection (direction + strength) |
| `specularColorNode` | vec3 | Specular color |
| `specularIntensityNode` | float | Specular intensity |
| `dispersionNode` | float | Chromatic dispersion (rainbow effect) |

**Note:** Properties like `transmission`, `thickness`, `ior` (without `Node` suffix) set scalar values directly. The `*Node` variants accept TSL node graphs for dynamic control.

### Glass Example

```tsx
const glass = new MeshPhysicalNodeMaterial()
glass.transmission = 1.0
glass.thickness = 0.5
glass.ior = 1.5
glass.roughness = 0
glass.metalness = 0
```

## SpriteNodeMaterial

For billboarded sprites that always face the camera.

```tsx
import { SpriteNodeMaterial } from 'three/webgpu'

const material = new SpriteNodeMaterial()
```

| Slot | Type | Description |
|------|------|-------------|
| `positionNode` | vec3 | Sprite center position |
| `colorNode` | vec4 | Color and alpha |
| `scaleNode` | float/vec2 | Sprite size |
| `rotationNode` | float | Rotation in radians |

### Sprite Example

```tsx
const sprite = new SpriteNodeMaterial()
sprite.colorNode = texture(spriteTexture)
sprite.scaleNode = uniform(1.0)
sprite.rotationNode = time
```

## PointsNodeMaterial

For point cloud rendering.

```tsx
import { PointsNodeMaterial } from 'three/webgpu'

const material = new PointsNodeMaterial()
```

| Slot | Type | Description |
|------|------|-------------|
| `positionNode` | vec3 | Point position |
| `colorNode` | vec4 | Color and alpha |
| `sizeNode` | float | Point size in pixels |

### Points Example

```tsx
const points = new PointsNodeMaterial()
points.colorNode = vec4(1, 0.5, 0, 1)
points.sizeNode = float(10)

// Circular points (instead of squares)
points.colorNode = Fn(() => {
  const dist = uv().sub(0.5).length()
  const alpha = smoothstep(0.5, 0.4, dist)
  return vec4(1, 0.5, 0, alpha)
})()
points.transparent = true
```

## LineBasicNodeMaterial

For solid line rendering.

```tsx
import { LineBasicNodeMaterial } from 'three/webgpu'

const material = new LineBasicNodeMaterial()
material.colorNode = vec3(1, 0, 0)
```

## MeshPhongNodeMaterial

Blinn-Phong shading with specular highlights.

| Slot | Type | Description |
|------|------|-------------|
| `shininessNode` | float | Specular sharpness (higher = tighter highlight) |
| `specularNode` | vec3 | Specular color |

## LineDashedNodeMaterial

For dashed line rendering.

```tsx
import { LineDashedNodeMaterial } from 'three/webgpu'

const material = new LineDashedNodeMaterial()
material.colorNode = vec3(1, 1, 1)
material.dashSize = 3
material.gapSize = 1
```

| Slot | Type | Description |
|------|------|-------------|
| `dashScaleNode` | float | Scale factor for dash pattern |
| `dashSizeNode` | float | Length of visible dash |
| `gapSizeNode` | float | Length of gap between dashes |
| `offsetNode` | float | Offset into dash pattern |

## MeshToonNodeMaterial

Cel-shaded / cartoon rendering.

```tsx
import { MeshToonNodeMaterial } from 'three/webgpu'

const material = new MeshToonNodeMaterial()
material.colorNode = vec3(0.5, 0.8, 1.0)
```

## MeshMatcapNodeMaterial

Use matcap texture for lighting.

```tsx
import { MeshMatcapNodeMaterial } from 'three/webgpu'

const material = new MeshMatcapNodeMaterial()
material.matcap = matcapTexture
// Or use node:
material.colorNode = texture(matcapTexture, matcapUV)
```

## Node vs Traditional Maps

Replace traditional texture maps with node equivalents:

| Traditional | Node Equivalent | Benefit |
|-------------|-----------------|---------|
| `.map` | `.colorNode` | Composable, procedural |
| `.normalMap` | `.normalNode` | Can add/blend normals |
| `.roughnessMap` | `.roughnessNode` | Math operations inline |
| `.metalnessMap` | `.metalnessNode` | Combine multiple sources |
| `.emissiveMap` | `.emissiveNode` | Animate, HDR values |
| `.aoMap` | `.aoNode` | Dynamic AO |
| `.envMap` | `.envNode` | Custom environment |

## Quick Patterns

### Detail Map

```tsx
material.colorNode = texture(baseMap).mul(texture(detailMap, uv().mul(10)))
```

### Vertex Displacement

```tsx
material.positionNode = positionLocal.add(normalLocal.mul(noise))
```

### Fresnel Effect

```tsx
const fresnel = positionView.negate().normalize().dot(normalView)
material.emissiveNode = fresnel.mul(color(0x00ffff))
```

### Matcap

```tsx
material.colorNode = texture(matcapMap, matcapUV)
```

### Rim Lighting

```tsx
const rim = float(1).sub(abs(normalView.z)).pow(3)
material.emissiveNode = color(0xff6600).mul(rim)
```

## Related

- [effects.md](effects.md) — backdropNode patterns
- [rendering.md](rendering.md) — fragmentNode and outputNode
- [transforms.md](transforms.md) — positionNode patterns
- [patterns.md](patterns.md) — Common material patterns
