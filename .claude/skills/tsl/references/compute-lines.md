# TSL Compute Lines: Single Draw Call Pattern

Render thousands of lines with a single draw call using compute shaders to write vertex data to storage buffers.

## Core Concept

Instead of creating separate `Line` or `Line2` objects for each line segment, use:
1. **StorageBufferAttribute** - GPU-writable vertex buffer
2. **Compute shaders** - Generate/update positions on GPU
3. **Single mesh** - One geometry with indexed quads or strips

## Two Approaches

### Approach A: Direct Vertex Writing (simpler)

Write line vertices directly to a `StorageBufferAttribute`. Best for dynamic lines that change every frame.

```tsx
// 1. Create storage buffers
const vertexCount = lineCount * 4 // 4 verts per line quad
const positionsSBA = new THREE.StorageBufferAttribute(vertexCount, 4)
const colorsSBA = new THREE.StorageBufferAttribute(vertexCount, 4)

// 2. Create geometry with storage attributes
const geometry = new THREE.BufferGeometry()
geometry.setAttribute('position', positionsSBA)
geometry.setAttribute('color', colorsSBA)

// 3. Generate indices for quads
const indices: number[] = []
for (let i = 0; i < lineCount; i++) {
  const b = i * 4
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3)
}
geometry.setIndex(indices)

// 4. Basic material reading colors from storage
const material = new THREE.MeshBasicNodeMaterial()
material.vertexColors = true
material.opacityNode = TSL.storage(colorsSBA, 'vec4', colorsSBA.count).toAttribute().w

// 5. Compute shader writes vertices
const updateLines = TSL.Fn(() => {
  const idx = TSL.instanceIndex
  const positions = TSL.storage(positionsSBA, 'vec4', positionsSBA.count)
  const colors = TSL.storage(colorsSBA, 'vec4', colorsSBA.count)

  const baseIdx = idx.mul(TSL.uint(4))

  // Get line start/end from your data source
  const start = /* ... */
  const end = /* ... */
  const lineWidth = TSL.float(0.02)

  // Create quad vertices (billboard toward camera or fixed axis)
  positions.element(baseIdx).xyz.assign(start)
  positions.element(baseIdx).y.addAssign(lineWidth)
  positions.element(baseIdx.add(1)).xyz.assign(start)
  positions.element(baseIdx.add(1)).y.addAssign(lineWidth.negate())
  positions.element(baseIdx.add(2)).xyz.assign(end)
  positions.element(baseIdx.add(2)).y.addAssign(lineWidth.negate())
  positions.element(baseIdx.add(3)).xyz.assign(end)
  positions.element(baseIdx.add(3)).y.addAssign(lineWidth)

  // Set colors
  TSL.Loop(4, ({ i }) => {
    colors.element(baseIdx.add(i)).assign(TSL.vec4(1, 1, 1, 1))
  })
})().compute(lineCount)

// 6. Execute compute
renderer.compute(updateLines) // or computeAsync for init
```

### Approach B: Instanced Strips with Data Buffer (scalable)

Store curve data in a `StorageInstancedBufferAttribute`, evaluate in vertex shader. Best for many similar curves.

```tsx
// 1. Define data layout (e.g., bezier curve = 4 control points)
const FLOATS_PER_CURVE = 16 // 4 vec4s: p0, p1, p2, p3
const SEGMENTS = 16 // tessellation resolution

// 2. Create strip geometry (shared by all instances)
function createStripGeometry(segments: number) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    positions.push(0, 0, 0) // left vertex
    positions.push(0, 0, 0) // right vertex
    uvs.push(t, -1)
    uvs.push(t, +1)

    if (i < segments) {
      const b = i * 2
      indices.push(b, b + 2, b + 1, b + 2, b + 3, b + 1)
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geom.setIndex(indices)
  return geom
}

// 3. Create data buffer
const curveData = new Float32Array(curveCount * FLOATS_PER_CURVE)
const curveAttr = new THREE.StorageInstancedBufferAttribute(curveData, 4)
const curveBuffer = TSL.storage(curveAttr)

// 4. Material evaluates curves per-vertex
const material = new THREE.MeshBasicNodeMaterial()

material.positionNode = TSL.Fn(() => {
  const uv = TSL.uv()
  const t = uv.x      // position along curve [0,1]
  const side = uv.y   // strip side [-1, +1]

  // Read curve control points from buffer
  const base = TSL.instanceIndex.mul(TSL.uint(4))
  const p0 = curveBuffer.element(base).xyz
  const p1 = curveBuffer.element(base.add(TSL.uint(1))).xyz
  const p2 = curveBuffer.element(base.add(TSL.uint(2))).xyz
  const p3 = curveBuffer.element(base.add(TSL.uint(3))).xyz

  // Evaluate bezier
  const bezier = TSL.Fn(([t, a, b, c, d]) => {
    const mt = TSL.float(1).sub(t)
    return a.mul(mt.pow(3))
      .add(b.mul(3).mul(mt.pow(2)).mul(t))
      .add(c.mul(3).mul(mt).mul(t.pow(2)))
      .add(d.mul(t.pow(3)))
  })

  const point = bezier(t, p0, p1, p2, p3)

  // Calculate tangent for billboard
  const eps = TSL.float(0.01)
  const tNext = TSL.min(t.add(eps), TSL.float(1))
  const nextPt = bezier(tNext, p0, p1, p2, p3)
  const tangent = nextPt.sub(point).normalize()

  // Billboard toward camera
  const viewDir = TSL.cameraPosition.sub(point).normalize()
  const right = viewDir.cross(tangent).normalize()

  const width = TSL.float(0.05)
  return point.add(right.mul(side).mul(width))
})()

// 5. Render as instanced mesh
<instancedMesh args={[geometry, material, curveCount]} frustumCulled={false} />
```

## Multi-Pass Compute Generation

For hierarchical structures (trees, L-systems), generate data level-by-level:

```tsx
async function generateLevels(renderer: THREE.WebGPURenderer) {
  for (let level = 1; level <= maxDepth; level++) {
    const generateLevel = TSL.Fn(() => {
      const idx = TSL.instanceIndex

      // Calculate parent index
      const parentIdx = /* based on your branching structure */

      // Read parent data
      const parentBase = parentIdx.mul(TSL.uint(4))
      const parentP0 = buffer.element(parentBase).xyz
      // ... read other control points

      // Generate child curve data
      const spawn = /* evaluate parent curve at spawn point */
      const end = /* calculate end point */

      // Write to buffer
      const outputBase = /* calculate output index */
      buffer.element(outputBase).assign(TSL.vec4(spawn, 0))
      // ... write other control points
    })().compute(branchesThisLevel)

    await renderer.computeAsync(generateLevel)
  }
}
```

## Key Patterns

### Storage Buffer Access

```tsx
// StorageBufferAttribute (direct vertex data)
const sba = new THREE.StorageBufferAttribute(count, 4) // vec4
const storageRef = TSL.storage(sba, 'vec4', count)

// StorageInstancedBufferAttribute (per-instance data)
const siba = new THREE.StorageInstancedBufferAttribute(data, 4)
const instanceBuffer = TSL.storage(siba)

// Reading in vertex shader
const value = instanceBuffer.element(TSL.instanceIndex.mul(stride)).xyz

// Writing in compute shader
storageRef.element(idx).xyz.assign(newValue)
storageRef.element(idx).w.assign(metadata)
```

### Line Width Techniques

```tsx
// Fixed axis offset (simple, good for 2D)
pos.y.addAssign(side.mul(width))

// Camera-facing billboard (3D)
const viewDir = TSL.cameraPosition.sub(point).normalize()
const right = viewDir.cross(tangent).normalize()
return point.add(right.mul(side).mul(width))

// Tangent-perpendicular (screen-space consistent)
const perp = TSL.vec3(tangent.z.negate(), 0, tangent.x).normalize()
return point.add(perp.mul(side).mul(width))
```

### Hiding Inactive Lines

```tsx
// In compute: write zero-length
buffer.element(idx).xyz.assign(TSL.vec3(0))

// In material: check visibility
const length = p3.sub(p0).length()
const isVisible = length.greaterThan(TSL.float(0.001))
material.opacityNode = TSL.select(isVisible, 1.0, 0.0)

// Or collapse vertices to same point
const effectiveWidth = TSL.select(isVisible, width, TSL.float(0))
```

## R3F Integration

```tsx
function ComputeLines({ rendererRef }: { rendererRef: React.MutableRefObject<THREE.WebGPURenderer | null> }) {
  const { geometry, material, buffer, computeInit, computeUpdate } = useMemo(() => {
    // ... create geometry, material, buffers, compute shaders
    return { geometry, material, buffer, computeInit, computeUpdate }
  }, [])

  // Initialize once
  useEffect(() => {
    if (!rendererRef.current) return
    rendererRef.current.computeAsync(computeInit)
  }, [rendererRef, computeInit])

  // Update per frame
  useFrame(() => {
    if (!rendererRef.current) return
    rendererRef.current.compute(computeUpdate)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

// Canvas setup
<Canvas
  gl={(props) => {
    extend(THREE as any)
    const renderer = new THREE.WebGPURenderer(props as any)
    return renderer.init().then(() => {
      rendererRef.current = renderer
      return renderer
    })
  }}
>
```

## Performance Tips

1. **Batch updates** - Write many lines in one compute dispatch
2. **Avoid recreating buffers** - Reuse storage buffers, update contents
3. **Use instanceIndex** - Cheaper than storing explicit IDs
4. **Pack data** - Use vec4 w-components for metadata (level, flags, etc.)
5. **Minimize compute passes** - Combine operations when possible
6. **frustumCulled={false}** - Required since bounding box isn't auto-computed

## Advanced: Multiple Storage Buffers for Variation

For per-entity variation (e.g., each tree having unique properties), use a secondary parameters buffer:

```tsx
// 1. Pack per-entity parameters on CPU
const PARAMS_PER_ENTITY = 8 // 2 vec4s worth
function packEntityParams(entityCount: number, seed: number): Float32Array {
  const packed = new Float32Array(entityCount * PARAMS_PER_ENTITY)
  for (let i = 0; i < entityCount; i++) {
    const rand = makePRNG(i * 137 + seed)
    const offset = i * PARAMS_PER_ENTITY
    packed[offset + 0] = rand() // rotation variation
    packed[offset + 1] = rand() // depth variation
    packed[offset + 2] = rand() // count variation
    packed[offset + 3] = rand() // size variation
    // ... more parameters
  }
  return packed
}

// 2. Create params buffer
const paramsData = packEntityParams(treeCount, layoutSeed)
const paramsAttr = new THREE.StorageInstancedBufferAttribute(paramsData, 4)
const paramsBuffer = TSL.storage(paramsAttr)

// 3. Look up in compute shader
const generateLevel = TSL.Fn(() => {
  const idx = TSL.instanceIndex

  // Get parent's entity index from main buffer
  const parentBase = parentIdx.mul(TSL.uint(STRIDE))
  const entityIndex = mainBuffer.element(parentBase).w.toInt()

  // Look up entity-specific params
  const paramBase = entityIndex.mul(TSL.uint(2)) // 2 vec4s per entity
  const params1 = paramsBuffer.element(paramBase)
  const params2 = paramsBuffer.element(paramBase.add(TSL.uint(1)))

  // Use params for variation
  const rotationVar = params1.x
  const depthVar = params1.y
  const countVar = params1.z

  // Skip branches if this entity has reduced depth
  const maxDepth = TSL.float(baseDepth).sub(TSL.floor(depthVar.mul(2)))
  TSL.If(TSL.float(level).greaterThan(maxDepth), () => {
    // Write zero-length to hide
    buffer.element(outputBase).assign(TSL.vec4(0))
    TSL.Return()
  })

  // Apply rotation variation
  const finalAngle = baseAngle.add(rotationVar.mul(TSL.PI.mul(2)))
  // ...
})().compute(branchCount)
```

This pattern separates:
- **Main buffer**: Geometry data (control points, positions)
- **Params buffer**: Per-entity variation (randomness seeds, style parameters)

Benefits:
- Params computed once on CPU, reused across all compute passes
- Avoids recalculating random values in each shader
- Easy to add new variation parameters without changing main buffer layout

## Reference Files

- Direct vertex writing: `2025-07-23-tsl-tree-lines/tsl-tree-lines-scene-1.tsx`
- Instanced strips: `2025-07-24-tsl-lines/tsl-forest-compute-3c.tsx`
- Multi-buffer variation: `2025-07-24-tsl-lines/tsl-forest-compute-4.tsx`
