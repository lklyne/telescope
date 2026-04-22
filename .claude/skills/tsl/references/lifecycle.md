# Lifecycle Hooks (Event System)

**Back to:** [SKILL.md](../SKILL.md)

## Overview

TSL provides three lifecycle hooks with different update frequencies for optimizing uniform updates.

## Hook Types Comparison

| Hook | Frequency | Use Case | Scope |
|------|-----------|----------|-------|
| `onFrameUpdate` | Once per frame | Time, global state | Shared across all objects |
| `onRenderUpdate` | Once per render pass | Scene fog, lighting | Shared per pass |
| `onObjectUpdate` | Per object render | Object position, rotation | Unique per mesh |

## onFrameUpdate - ONCE per frame

Best for time, animation state, and global values:

```tsx
// Best for: time, animation state, global values
const timeUniform = uniform(0)
timeUniform.onFrameUpdate(({ time, deltaTime }) => time)

// Global animation state
const globalPhase = uniform(0)
globalPhase.onFrameUpdate(({ time }) => Math.sin(time * 0.5))

// ✅ Use for values that are the same for ALL objects in the scene
// ⚠️ Called once per frame, NOT per object
```

## onRenderUpdate - Once per render pass

Best for scene properties, fog, and shared material values:

```tsx
// Best for: scene properties, fog, shared material values
const fogDensity = uniform(0)
fogDensity.onRenderUpdate(({ scene }) => scene.fog?.density ?? 0)

// Camera properties
const cameraNear = uniform(0)
cameraNear.onRenderUpdate(({ camera }) => camera.near)

// ✅ Use for scene/camera/pass-level data
// ⚠️ Called once per render pass (useful for multi-pass effects)
```

## onObjectUpdate - Per object

Best for object-specific data (position, userData, etc.):

```tsx
// Best for: object-specific data (position, userData, etc.)
const objectY = uniform(0)
objectY.onObjectUpdate(({ object }) => object.position.y)

// Material userData
const tintColor = uniform(new THREE.Color())
tintColor.onObjectUpdate(({ material }) => material.userData.tint)

// Different per mesh instance
const meshScale = uniform(1)
meshScale.onObjectUpdate(({ object }) => object.scale.x)

// ✅ Use when value differs per object
// ⚠️ Called for EVERY object that uses this material
```

## Available Context in Hooks

```tsx
.onFrameUpdate(({ time, deltaTime, frame }) => { /* ... */ })
.onRenderUpdate(({ scene, camera, renderer, backend }) => { /* ... */ })
.onObjectUpdate(({ object, material, geometry, camera, scene }) => { /* ... */ })
```

## Performance Tip

```tsx
// ❌ Bad - per-object hook for global value
const time = uniform(0)
time.onObjectUpdate(({ /* context */ }) => performance.now())
// Called hundreds of times per frame if 100 objects!

// ✅ Good - frame hook for global value
const time = uniform(0)
time.onFrameUpdate(({ time }) => time)
// Called once per frame
```

## Common Patterns

### Animated Time

```tsx
const timeUniform = uniform(0)
timeUniform.onFrameUpdate(({ time }) => time)
material.colorNode = vec3(sin(positionWorld.add(timeUniform)))
```

### Object-Specific Tint

```tsx
const tintUniform = uniform(new THREE.Color())
tintUniform.onObjectUpdate(({ material }) => {
  return material.userData.tint || new THREE.Color(0xffffff)
})
material.colorNode = baseColor.mul(tintUniform)
```

### Scene Fog

```tsx
const fogDensityUniform = uniform(0)
fogDensityUniform.onRenderUpdate(({ scene }) => scene.fog?.density ?? 0)
```

## Related

- [optimization.md](optimization.md) - Performance considerations
- [inspector.md](inspector.md) - Inspector nodes update timing
