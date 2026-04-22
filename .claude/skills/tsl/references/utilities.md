# Utilities Reference

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides built-in utilities for common shader operations: oscillators, blend modes, UV manipulation, and interpolation helpers.

## Oscillators

All oscillators output 0→1 range and default to `time` if no argument provided.

| Function | Pattern | Output |
|----------|---------|--------|
| `oscSine(t)` | Sine wave | 0 → 1 → 0 |
| `oscSquare(t)` | Square wave | 0 or 1 |
| `oscTriangle(t)` | Triangle wave | 0 → 1 → 0 (linear) |
| `oscSawtooth(t)` | Sawtooth wave | 0 → 1 (reset) |

```tsx
// Auto-animated (uses time internally)
material.opacityNode = oscSine()

// Custom time/phase
const phase = time.mul(2)
material.opacityNode = oscSine(phase)

// Per-instance animation
const offset = instanceIndex.toFloat().mul(0.1)
material.colorNode = vec3(oscSine(time.add(offset)), 0.5, 0.8)
```

**⚠️ Deprecated:** `oscSine(timerGlobal)` → use `oscSine(time)` or `oscSine()`

## Blend Modes

Blend two colors like Photoshop layer modes:

| Function | Effect |
|----------|--------|
| `blendBurn(a, b)` | Color burn |
| `blendDodge(a, b)` | Color dodge |
| `blendScreen(a, b)` | Screen |
| `blendOverlay(a, b)` | Overlay |
| `blendColor(a, b)` | Normal blend |

```tsx
const base = texture(baseMap)
const detail = texture(detailMap)

// Overlay blend for detail
material.colorNode = blendOverlay(base, detail)

// Screen blend for additive glow
material.colorNode = blendScreen(base, glowColor)
```

## UV Utilities

### rotateUV

```tsx
rotateUV(uv, rotation, center = vec2(0.5))
```

Rotate UV coordinates around a center point.

```tsx
// Rotate texture 45 degrees
const rotatedUV = rotateUV(uv(), Math.PI / 4)
material.colorNode = texture(map, rotatedUV)

// Animated rotation
const rotatedUV = rotateUV(uv(), time.mul(0.5))
```

### spherizeUV

```tsx
spherizeUV(uv, strength, center = vec2(0.5))
```

Spherical distortion (fisheye effect).

```tsx
const distorted = spherizeUV(uv(), 0.5)
material.colorNode = texture(map, distorted)
```

### spritesheetUV

```tsx
spritesheetUV(count, uv = uv(), frame = 0)
```

Animate through sprite sheet frames.

```tsx
// 4x4 sprite sheet, animate based on time
const count = vec2(4, 4)
const frame = time.mul(10).floor().mod(16)
const spriteUV = spritesheetUV(count, uv(), frame)
material.colorNode = texture(spriteSheet, spriteUV)
```

### equirectUV

```tsx
equirectUV(direction = positionWorldDirection)
```

Convert direction to equirectangular UV for environment maps.

```tsx
const envUV = equirectUV(reflectVector)
material.envNode = texture(envMap, envUV)
```

## Interpolation Helpers

### remap

```tsx
remap(value, inLow, inHigh, outLow = 0, outHigh = 1)
```

Remap value from one range to another.

```tsx
// Remap -1→1 to 0→1
const normalized = remap(value, -1, 1, 0, 1)

// Remap 0→1 to custom range
const scaled = remap(uv().x, 0, 1, 10, 100)
```

### remapClamp

```tsx
remapClamp(value, inLow, inHigh, outLow = 0, outHigh = 1)
```

Same as remap but clamps output to outLow→outHigh.

```tsx
// Remap with clamping (no values outside 0-1)
const clamped = remapClamp(distance, 0, 10, 0, 1)
```

## Random

### hash

```tsx
hash(seed)
```

Pseudo-random float [0,1] from seed value.

```tsx
// Random per-pixel
const noise = hash(screenCoordinate)

// Random per-instance (stable)
const instanceRandom = hash(instanceIndex.toFloat())
```

### range

```tsx
range(min, max)
```

Random attribute per instance. Creates stable random values in range.

```tsx
// Random scale per instance
const randomScale = range(0.8, 1.2)
material.positionNode = positionLocal.mul(randomScale)
```

## Matcap UV

```tsx
matcapUV
```

Pre-computed matcap texture coordinates from view-space normals.

```tsx
material.colorNode = texture(matcapTexture, matcapUV)
```

## Grayscale

```tsx
grayscale(color)
```

Convert color to grayscale using luminance weights.

```tsx
const gray = grayscale(texture(map))
material.colorNode = gray
```

## Color Space

```tsx
// Convert between color spaces
sRGBToLinear(color)
linearTosRGB(color)
```

## Packing

Convert between directions and colors (useful for encoding normals in textures):

```tsx
directionToColor(vec3)  // Direction (-1,1) → Color (0,1)
colorToDirection(vec3)  // Color (0,1) → Direction (-1,1)
```

## Triplanar Texture

```tsx
triplanarTexture(texX, texY, texZ, scale, position, normal)
```

Project textures from all three axes, blend based on normal.

```tsx
// Same texture all axes
const triplanar = triplanarTexture(
  map, map, map,
  1.0,
  positionWorld,
  normalWorld
)

// Different textures per axis
const triplanar = triplanarTexture(
  topTex, sideTex, sideTex,
  0.5,
  positionWorld,
  normalWorld
)
```

## Common Utility Patterns

### Pulsing Effect

```tsx
const pulse = oscSine(time.mul(2)).mul(0.5).add(0.5)
material.emissiveNode = color.mul(pulse)
```

### Scrolling Texture

```tsx
const scrolledUV = uv().add(vec2(time.mul(0.1), 0))
material.colorNode = texture(map, scrolledUV)
```

### Random Color per Instance

```tsx
const hue = hash(instanceIndex.toFloat())
const saturation = float(0.8)
const lightness = float(0.5)
material.colorNode = vec3(hue, saturation, lightness) // Use with HSL conversion
```

### Fresnel Rim

```tsx
const viewDir = cameraPosition.sub(positionWorld).normalize()
const fresnel = normalWorld.dot(viewDir).oneMinus().pow(3)
material.emissiveNode = color(0x00ffff).mul(fresnel)
```

## Related

- [patterns.md](patterns.md) — More complex shader patterns
- [effects.md](effects.md) — Screen-space effects
- [syntax.md](syntax.md) — Math functions reference

