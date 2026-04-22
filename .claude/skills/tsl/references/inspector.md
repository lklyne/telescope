# Inspector Integration (Leva)

**Back to:** [SKILL.md](../SKILL.md)

## Overview

Built-in inspector nodes auto-generate Leva controls without `useControls`, providing live shader debugging and tweaking.

## Inspector Node Methods

```tsx
// Input types (editable)
.toInput('range', { min: 0, max: 1, step: 0.01 })  // Slider
.toInput('number', { min: 0, max: 100 })           // Number input
.toInput('color')                                   // Color picker
.toInput('vector2')                                 // 2D vector
.toInput('vector3')                                 // 3D vector
.toInput('boolean')                                 // Checkbox

// Monitor (read-only display)
.toMonitor()                                        // Shows current value

// Custom label
.toInput('range', { min: 0, max: 1 }).label('Roughness')
```

## Common Patterns

### Material Properties with Sliders

```tsx
material.roughnessNode = uniform(0.5).toInput('range', { min: 0, max: 1 })
material.metalnessNode = uniform(0).toInput('range', { min: 0, max: 1 })
```

### Color with Picker

```tsx
material.colorNode = uniform(new THREE.Color('#ff6b35')).toInput('color')
```

### Vector Displacement with 3D Control

```tsx
const offset = uniform(new THREE.Vector3()).toInput('vector3')
material.positionNode = positionLocal.add(offset)
```

### Monitor Computed Values

```tsx
const fresnel = positionView.negate().normalize().dot(normalView)
fresnel.toMonitor().label('Fresnel')
```

## Inspector + Memoization

Store uniform ref, inspector updates it automatically:

```tsx
// Store uniform ref, inspector updates it automatically
const uniforms = useMemo(() => ({
  roughness: uniform(0.5).toInput('range', { min: 0, max: 1 }),
  color: uniform(new THREE.Color('#ff0')).toInput('color')
}), [])

material.roughnessNode = uniforms.roughness
material.colorNode = uniforms.color
```

## Combine with Manual Leva

Inspector nodes and custom controls coexist:

```tsx
// TSL inspector for material properties
material.roughnessNode = uniform(0.5).toInput('range', { min: 0, max: 1 })

// Manual Leva for app state
const { debugMode } = useControls({ debugMode: false })
```

## All Input Types Reference

### range

Slider with min, max, step:

```tsx
uniform(0.5).toInput('range', { min: 0, max: 1, step: 0.01 })
```

### number

Number input with optional bounds:

```tsx
uniform(10).toInput('number', { min: 0, max: 100 })
```

### color

Color picker:

```tsx
uniform(new THREE.Color('#ff0')).toInput('color')
```

### vector2

2D vector control:

```tsx
uniform(new THREE.Vector2(0, 0)).toInput('vector2')
```

### vector3

3D vector control:

```tsx
uniform(new THREE.Vector3(0, 0, 0)).toInput('vector3')
```

### boolean

Checkbox:

```tsx
uniform(true).toInput('boolean')
```

## Related

- [optimization.md](optimization.md) - Memoization with inspector nodes
- [lifecycle.md](lifecycle.md) - When inspector updates trigger
