# Viewport vs Screen Coordinates

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides two coordinate systems: Screen (full framebuffer) and Viewport (respects `renderer.setViewport()`).

## Coordinate Systems Comparison

| Node | Coordinate System | Units | Affected by DPR | Affected by setViewport() |
|------|-------------------|-------|-----------------|---------------------------|
| `screenUV` | Full framebuffer | Normalized [0,1] | No | No |
| `screenCoordinate` | Full framebuffer | Physical pixels | Yes | No |
| `screenSize` | Full framebuffer | Physical pixels | Yes | No |
| `screenDPR` | Device pixel ratio | Number | N/A | No |
| `viewportUV` | Viewport only | Normalized [0,1] | No | Yes |
| `viewportCoordinate` | Viewport only | Physical pixels | Yes | Yes |
| `viewportSize` | Viewport only | Physical pixels | Yes | Yes |
| `viewport` | Viewport bounds | vec4(x,y,w,h) px | Yes | Yes |

## When to Use Each

### Post-Processing Effects - Use Screen

For effects that operate on the full framebuffer:

```tsx
// Post-processing effects - use screen (full buffer)
const effect = texture(sceneTexture, screenUV)

// Physical pixel coordinates for screen-space effects
const pixelPos = screenCoordinate  // Accounts for DPR automatically
const gridPattern = mod(pixelPos, 2).step(1)  // Checkerboard
```

### Multi-Viewport Rendering - Use Viewport

When working with multiple viewports:

```tsx
// Multi-viewport rendering - use viewport
renderer.setViewport(0, 0, width / 2, height)  // Left half
material.colorNode = viewportUV  // [0,1] within left half only

// Viewport-aware effects
const inViewport = viewportCoordinate.div(viewportSize)  // Normalized [0,1]
```

## DPR Handling

```tsx
// screenCoordinate already includes DPR
const physicalPixelX = screenCoordinate.x  // Actual pixel on screen

// Manual DPR calculation if needed
const logicalPixelX = screenCoordinate.x.div(screenDPR)

// Storage textures MUST account for DPR
const tex = new THREE.StorageTexture(
  width * devicePixelRatio,   // Physical pixels
  height * devicePixelRatio
)
```

## Common Patterns

### Screen-Space Gradient

```tsx
material.colorNode = vec3(screenUV.x, screenUV.y, 0)
```

### Pixel-Perfect Effects

```tsx
const pixelGrid = mod(screenCoordinate, vec2(10)).step(1)
```

### Viewport-Relative Positioning

For multi-view rendering:

```tsx
const centerOffset = viewportUV.sub(0.5)  // [-0.5, 0.5] from center
const vignette = centerOffset.length().oneMinus()
```

## Related

- [rendering.md](rendering.md) - Post-processing with screen coordinates
- [compute.md](compute.md) - Storage textures and DPR handling
