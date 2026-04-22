# MRT & Post-Processing

**Back to:** [SKILL.md](../SKILL.md)

## Overview

WebGPU/TSL provides modern rendering techniques: Multiple Render Targets (MRT) for deferred rendering and PostProcessing for effects chains.

## Post-Processing (WebGPU/TSL)

Modern pattern using `RenderPipeline` class (renamed from `PostProcessing` in r183).

```tsx
// r183+
import { RenderPipeline, pass } from 'three/webgpu'
const pipeline = new RenderPipeline(renderer)

// r182 and earlier
import { PostProcessing, pass } from 'three/webgpu'
const pipeline = new PostProcessing(renderer)

// Create scene pass
const scenePass = pass(scene, camera)

// Chain effects via outputNode
pipeline.outputNode = scenePass
  .getTexture()         // Get render output
  .gaussianBlur(4)      // Blur
  .add(bloom())         // Add bloom

// In useFrame
useFrame(({ gl }) => {
  pipeline.render()
})
```

### Access Multiple Render Outputs

```tsx
// Setup MRT in scene pass
scenePass.setMRT(mrt({
  output: output,
  normal: transformedNormalView,
  depth: viewportDepth
}))

// Access individual buffers by name
const colorTex = scenePass.getTexture()        // Default output
const normalTex = scenePass.getTexture('normal')
const depthTex = scenePass.getTexture('depth')

// Use in post-processing chain
const ssao = ssaoPass(normalTex, depthTex)
pipeline.outputNode = colorTex.add(ssao)
```

### Pass Options

```tsx
const scenePass = pass(scene, camera, {
  minFilter: THREE.NearestFilter,  // Crisp pixels
  magFilter: THREE.NearestFilter,
  samples: 4                        // MSAA
})
```

## MRT (Multiple Render Targets) & G-Buffer

For deferred rendering: output multiple buffers in a single render pass.

### Material-Based MRT

```tsx
import { mrt, output, normalView, viewportDepth, diffuseColor, positionView } from 'three/tsl'

// Setup G-buffer outputs in material
material.mrtNode = mrt({
  output: output,                    // Color/albedo
  normal: transformedNormalView,     // View-space normals
  depth: viewportDepth,              // Depth buffer
  position: positionView,            // View-space positions
  diffuse: diffuseColor              // Base color (no lighting)
})
```

### Pass-Based MRT

```tsx
import { pass } from 'three/webgpu'

// Create scene pass with MRT
const scenePass = pass(scene, camera, {
  minFilter: THREE.NearestFilter,  // Crisp data (no blending)
  magFilter: THREE.NearestFilter
})

// Setup multiple outputs
scenePass.setMRT(mrt({
  output: output,
  normal: transformedNormalView,
  depth: viewportDepth,
  position: positionView
}))

// Access individual buffers by name
const colorBuffer = scenePass.getTexture()           // Default 'output'
const normalBuffer = scenePass.getTexture('normal')
const depthBuffer = scenePass.getTexture('depth')
const posBuffer = scenePass.getTexture('position')
```

## Deferred Rendering Pipeline

```tsx
// 1. G-buffer pass (render scene data)
scenePass.setMRT(mrt({
  output: output,
  normal: normalView,
  depth: viewportDepth
}))

// 2. Lighting pass (use G-buffer data)
const normalTex = scenePass.getTexture('normal')
const depthTex = scenePass.getTexture('depth')

// SSAO example
const ssaoNode = Fn(() => {
  const normal = texture(normalTex, screenUV)
  const depth = texture(depthTex, screenUV)

  // Sample around pixel using normals and depth
  // ... SSAO algorithm
  return aoValue
})()

// 3. Combine in post-processing
pipeline.outputNode = scenePass.getTexture().mul(ssaoNode)
```

## Common G-Buffer Channels

### Standard Deferred Setup

```tsx
mrt({
  output: output,                    // Final color (or albedo)
  normal: transformedNormalView,     // Normals for lighting
  depth: viewportDepth,              // Depth for reconstruction
  position: positionView,            // Positions (or reconstruct from depth)
  diffuse: diffuseColor,             // Base color (no lighting)
  specular: specularColor,           // Specular reflectance
  roughness: roughness,              // Roughness value
  metalness: metalness               // Metalness value
})
```

### Minimal SSAO Setup

```tsx
mrt({
  output: output,
  normal: normalView,
  depth: viewportDepth
})
```

## Filter Settings for G-Buffer

Use nearest filtering to preserve data accuracy:

```tsx
pass(scene, camera, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  type: THREE.FloatType  // For HDR or precise depth
})
```

## Advanced Features

- **Render manipulation:** `gaussianBlur()`, `viewportSharedTexture()` handle multi-pass automatically
- **G-buffer fallback:** WebGL uses separate render targets; WebGPU uses MRT

## Related

- [coordinates.md](coordinates.md) - screenUV for post-processing
- [materials.md](materials.md) - outputNode and fragmentNode
- [effects.md](effects.md) - viewportSharedTexture usage
