# Common Shader Patterns

**Back to:** [SKILL.md](../SKILL.md)

## Overview

Reusable shader patterns for common effects. Copy-paste ready.

## Fresnel (Rim Lighting)

```tsx
// Basic fresnel
const viewDir = cameraPosition.sub(positionWorld).normalize()
const NdotV = normalWorld.dot(viewDir).max(0)
const fresnel = float(1).sub(NdotV).pow(5)

// Apply to emission
material.emissiveNode = color(0x00ffff).mul(fresnel)

// As a function
const fresnel = Fn(({ power = 5 }) => {
  const viewDir = cameraPosition.sub(positionWorld).normalize()
  const NdotV = normalWorld.dot(viewDir).max(0)
  return float(1).sub(NdotV).pow(power)
})
```

## Soft Falloff / Attenuation

```tsx
// Exponential falloff (good for glow)
const falloff = exp(distance.negate().mul(rate))

// Inverse square falloff (physically accurate)
const attenuation = float(1).div(distance.mul(distance).add(1))

// Smooth falloff with control
const smooth = smoothstep(maxDist, 0, distance)
```

## Gradient Mapping

```tsx
// Two-color gradient
const t = smoothstep(0, 1, inputValue)
const colorA = vec3(0.1, 0.2, 0.8)  // Dark blue
const colorB = vec3(1.0, 0.5, 0.2)  // Orange
const gradient = mix(colorA, colorB, t)

// Three-color gradient
const t = inputValue
const color1 = vec3(0, 0, 1)    // Blue
const color2 = vec3(1, 1, 0)    // Yellow
const color3 = vec3(1, 0, 0)    // Red

const gradient = mix(
  mix(color1, color2, saturate(t.mul(2))),
  color3,
  saturate(t.mul(2).sub(1))
)
```

## Circular Mask (Sprites/Points)

```tsx
// For sprites and point materials
const uvCentered = uv().sub(0.5).mul(2)  // -1 to 1
const dist = length(uvCentered)

// Hard edge circle
const circle = step(dist, 1)

// Soft edge circle
const softCircle = smoothstep(1, 0.8, dist)

// Ring
const ring = smoothstep(0.8, 0.85, dist).mul(smoothstep(1, 0.95, dist))
```

## Wave Displacement

```tsx
// Simple sine wave
material.positionNode = Fn(() => {
  const pos = positionLocal.toVar()
  const wave = sin(pos.x.mul(5).add(time.mul(2))).mul(0.2)
  pos.y.addAssign(wave)
  return pos
})()

// Multi-frequency waves
const wave1 = sin(positionWorld.x.mul(2).add(time))
const wave2 = sin(positionWorld.z.mul(3).add(time.mul(1.5)))
const combined = wave1.add(wave2).mul(0.1)
```

## UV Scroll

```tsx
// Horizontal scroll
const scrolledUV = uv().add(vec2(time.mul(0.1), 0))
material.colorNode = texture(map, scrolledUV)

// Diagonal scroll
const scrolledUV = uv().add(time.mul(vec2(0.1, 0.05)))

// Parallax layers
const layer1UV = uv().add(time.mul(0.1))
const layer2UV = uv().add(time.mul(0.2))
```

## Noise-Based Displacement

```tsx
import { mx_noise_float } from 'three/tsl'

material.positionNode = Fn(() => {
  const pos = positionLocal.toVar()
  const noiseInput = positionWorld.mul(2).add(time.mul(0.5))
  const displacement = mx_noise_float(noiseInput).mul(0.3)
  pos.addAssign(normalLocal.mul(displacement))
  return pos
})()
```

## Conditional Value (Branchless)

```tsx
// Using step (preferred for performance)
const result = mix(valueB, valueA, step(0.5, selector))

// Using select (clearer intent)
const result = select(value.greaterThan(0.5), valueA, valueB)

// Smooth transition
const result = mix(valueA, valueB, smoothstep(0.4, 0.6, selector))
```

## Distance-Based Effect

```tsx
// Distance from point
const center = vec3(0, 0, 0)
const dist = positionWorld.sub(center).length()

// Fade by distance
const fade = saturate(dist.div(maxDistance).oneMinus())

// Rings
const rings = sin(dist.mul(10).sub(time.mul(2))).mul(0.5).add(0.5)
```

## Screen-Space Vignette

```tsx
const center = screenUV.sub(0.5)
const dist = center.length()
const vignette = smoothstep(0.7, 0.3, dist)
material.colorNode = baseColor.mul(vignette)
```

## Checkerboard Pattern

```tsx
// UV-based checkerboard
const checker = uv().mul(10).floor()
const pattern = checker.x.add(checker.y).mod(2)
material.colorNode = mix(colorA, colorB, pattern)

// Screen-space checkerboard
const pixels = screenCoordinate.div(10).floor()
const pattern = pixels.x.add(pixels.y).mod(2)
```

## Dissolve Effect

```tsx
const noiseValue = mx_noise_float(positionWorld.mul(5))
const threshold = uniform(0.5)  // Animate this 0→1

// Hard edge dissolve
const mask = step(threshold, noiseValue)
material.opacityNode = mask

// Soft edge with glow
const edge = smoothstep(threshold.sub(0.1), threshold.add(0.1), noiseValue)
material.opacityNode = edge
material.emissiveNode = color(0xff6600).mul(smoothstep(0.1, 0, abs(noiseValue.sub(threshold))))
```

## Outline / Edge Detection

```tsx
// View-space normal edge
const edge = fwidth(normalView).length()
const outline = smoothstep(0, 0.1, edge)

// Fresnel-based outline
const rim = float(1).sub(abs(normalView.z))
const outline = smoothstep(0.6, 0.8, rim)
```

## Pixelation

```tsx
const pixelSize = uniform(8)
const pixelatedUV = uv().mul(screenSize.div(pixelSize)).floor().div(screenSize.div(pixelSize))
material.colorNode = texture(map, pixelatedUV)
```

## Color Manipulation

### Hue Shift

```tsx
// Simple hue rotation (approximation)
const shifted = vec3(
  originalColor.r.mul(cos(hueAngle)).add(originalColor.g.mul(sin(hueAngle))),
  originalColor.g.mul(cos(hueAngle)).sub(originalColor.r.mul(sin(hueAngle))),
  originalColor.b
)
```

### Saturation

```tsx
const gray = grayscale(originalColor)
const saturated = mix(gray, originalColor, saturationAmount)
```

### Contrast

```tsx
const contrasted = originalColor.sub(0.5).mul(contrastAmount).add(0.5)
```

## Instance Variation

```tsx
// Random color per instance
const hue = hash(instanceIndex.toFloat())
material.colorNode = vec3(hue, 0.8, 0.5)

// Random scale
const scale = hash(instanceIndex.toFloat()).mul(0.5).add(0.75)
material.positionNode = positionLocal.mul(scale)

// Random animation phase
const phase = hash(instanceIndex.toFloat()).mul(Math.PI * 2)
const animated = sin(time.add(phase))
```

## Scanlines

```tsx
const scanlineFreq = 100
const scanlines = sin(screenCoordinate.y.mul(scanlineFreq)).mul(0.5).add(0.5)
const intensity = 0.1
material.colorNode = baseColor.mul(float(1).sub(scanlines.mul(intensity)))
```

## Hologram Effect

```tsx
const scanlines = sin(positionWorld.y.mul(50).add(time.mul(5))).mul(0.5).add(0.5)
const fresnel = float(1).sub(abs(normalView.z)).pow(2)
const flicker = oscSine(time.mul(20)).mul(0.1).add(0.9)

material.colorNode = color(0x00ffff)
material.opacityNode = fresnel.mul(scanlines).mul(flicker).mul(0.8)
material.emissiveNode = color(0x00ffff).mul(fresnel)
material.transparent = true
```

## Related

- [utilities.md](utilities.md) — Oscillators, blend modes, UV utils
- [effects.md](effects.md) — Screen-space effects (backdrop, refraction)
- [syntax.md](syntax.md) — Math functions reference

