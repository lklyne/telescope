# BackdropNode & Screen-Space Effects

**Back to:** [SKILL.md](../SKILL.md)

## Overview

BackdropNode enables transmission and refraction effects by accessing already-rendered content behind objects - perfect for glass, water, and refractive materials.

## Why backdropNode?

- Preserves render order (no manual sorting needed)
- Easy refraction/transmission effects
- Works with transparent materials

## Basic Refraction

Simple screen grab without distortion:

```tsx
material.backdropNode = viewportSharedTexture(screenUV)
material.transparent = true
material.opacity = 0.8
```

## With Distortion (Glass/Water)

Use normals to distort the UV coordinates:

```tsx
// Use normals to distort UV
const distortion = normalView.xy.mul(0.1)  // Distortion strength
const distortedUV = screenUV.add(distortion)

material.backdropNode = viewportSharedTexture(distortedUV)
material.transparent = true
```

## Control Backdrop Alpha

```tsx
material.backdropNode = viewportSharedTexture(screenUV)
material.backdropAlphaNode = float(0.5)  // 50% backdrop blend
material.transparent = true
```

## Advanced: Chromatic Aberration

Separate R, G, B channels for color fringing effect:

```tsx
const strength = 0.01
const distortedUV = screenUV.add(normalView.xy.mul(strength))

// Separate R,G,B channels
const r = viewportSharedTexture(distortedUV.add(vec2(strength, 0))).r
const g = viewportSharedTexture(distortedUV).g
const b = viewportSharedTexture(distortedUV.sub(vec2(strength, 0))).b

material.backdropNode = vec3(r, g, b)
material.transparent = true
```

## MeshPhysicalNodeMaterial Transmission

Physical-based transmission with thickness and IOR:

```tsx
import { MeshPhysicalNodeMaterial } from 'three/webgpu'

const material = new MeshPhysicalNodeMaterial()
material.transmission = 1.0    // Fully transmissive
material.thickness = 0.5       // Glass thickness
material.ior = 1.5             // Index of refraction (1.5 = glass)

// Custom backdrop processing
material.backdropNode = grayscale(viewportSharedTexture(screenUV))
```

## Frosted Glass

Blur the backdrop for frosted effect:

```tsx
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'

// Blur the backdrop
material.backdropNode = gaussianBlur(viewportSharedTexture(screenUV), null, 5)
material.transmission = 0.9
material.roughness = 0.3
material.transparent = true
```

## Quick Reference

### Grayscale Refraction

```tsx
material.backdropNode = grayscale(viewportSharedTexture(screenUV))
```

### Fresnel-Based Transmission

```tsx
const fresnel = positionView.negate().normalize().dot(normalView)
material.backdropAlphaNode = fresnel
material.backdropNode = viewportSharedTexture(screenUV)
```

## Related

- [coordinates.md](coordinates.md) - screenUV and viewportUV
- [materials.md](materials.md) - backdropNode and backdropAlphaNode slots
- [rendering.md](rendering.md) - viewportSharedTexture
