# TSL Syntax Reference

**Back to:** [SKILL.md](../SKILL.md)

## Overview

Complete reference for TSL operators, control flow, variables, and loops. TSL uses method chaining — every operation returns a new node.

## Operators

### Arithmetic

```tsx
a.add(b)      // a + b (supports multiple: a.add(b, c, d))
a.sub(b)      // a - b
a.mul(b)      // a * b
a.div(b)      // a / b
a.mod(b)      // a % b
a.negate()    // -a
```

### Assignment (Mutable Variables Only)

Requires `.toVar()` first:

```tsx
const v = vec3(1, 2, 3).toVar()

v.assign(x)        // v = x
v.addAssign(x)     // v += x
v.subAssign(x)     // v -= x
v.mulAssign(x)     // v *= x
v.divAssign(x)     // v /= x
```

### Comparison (Returns bool node)

```tsx
a.equal(b)            // a == b
a.notEqual(b)         // a != b
a.lessThan(b)         // a < b
a.greaterThan(b)      // a > b
a.lessThanEqual(b)    // a <= b
a.greaterThanEqual(b) // a >= b
```

### Logical

```tsx
a.and(b)   // a && b
a.or(b)    // a || b
a.not()    // !a
a.xor(b)   // a ^ b (logical)
```

### Bitwise

```tsx
a.bitAnd(b)     // a & b
a.bitOr(b)      // a | b
a.bitXor(b)     // a ^ b
a.bitNot()      // ~a
a.shiftLeft(n)  // a << n
a.shiftRight(n) // a >> n
```

### Swizzle

```tsx
v.x  v.y  v.z  v.w          // single component
v.xy  v.xyz  v.xyzw         // multiple components
v.zyx  v.bgr                // reorder
v.xxx                       // duplicate

// Aliases work interchangeably:
// xyzw = rgba = stpq
```

## Variables

### The Immutability Rule

**TSL nodes are immutable by default.** You cannot modify them directly.

```tsx
// ❌ WRONG: Cannot modify immutable node
const pos = positionLocal
pos.y = pos.y.add(1)  // ERROR!

// ✅ CORRECT: Use .toVar() for mutable variable
const pos = positionLocal.toVar()
pos.y.assign(pos.y.add(1))  // OK
```

### Variable Types

```tsx
const v = expr.toVar()           // Mutable variable
const v = expr.toVar('name')     // Named mutable variable (shows in debug)
const v = Var(expr)              // Alternative: standalone Var() constructor
const c = expr.toConst()         // Inline constant (no variable created)
const c = Const(expr)            // Alternative: standalone Const() constructor
const p = property('float')      // Uninitialized property
```

### When to Use .toVar()

- ✅ When you need to modify a value
- ✅ For expensive operations used multiple times (caching)
- ✅ Inside `Fn()` for intermediate results
- ❌ For simple expressions used once

## Control Flow

**Important:** Control flow requires `Fn()` wrapper. Use capital letters (`If`, not `if`).

### If / ElseIf / Else

```tsx
const myShader = Fn(() => {
  const result = float(0).toVar()
  
  If(a.greaterThan(b), () => {
    result.assign(a)
  }).ElseIf(a.lessThan(c), () => {
    result.assign(c)
  }).Else(() => {
    result.assign(b)
  })
  
  return result
})
```

### select() — Ternary Alternative (Preferred)

**Works outside `Fn()`!** Returns a value directly.

```tsx
// Equivalent to: condition ? valueIfTrue : valueIfFalse
const result = select(condition, valueIfTrue, valueIfFalse)

// Example: clamp with custom logic
const clamped = select(x.greaterThan(max), max, x)

// Nested
const clamped = select(
  x.greaterThan(max), max,
  select(x.lessThan(min), min, x)
)
```

### Math-Based Conditionals (Best Performance)

Prefer these over branching when possible:

```tsx
step(edge, x)           // x < edge ? 0 : 1
mix(a, b, t)            // a*(1-t) + b*t
smoothstep(e0, e1, x)   // smooth 0→1 transition
clamp(x, min, max)      // constrain range
saturate(x)             // clamp(x, 0, 1)

// Pattern: conditional selection without branching
mix(valueA, valueB, step(threshold, selector))
```

### Switch / Case

```tsx
Switch(mode)
  .Case(0, () => { out.assign(red) })
  .Case(1, () => { out.assign(green) })
  .Case(2, 3, () => { out.assign(blue) })  // Multiple values
  .Default(() => { out.assign(white) })

// NOTE: No fallthrough, implicit break
```

## Loops

### Basic Loop

```tsx
Loop(count, ({ i }) => {
  // i is the loop index (int node)
  sum.addAssign(arr.element(i))
})
```

### With Options

```tsx
Loop({ 
  start: int(0), 
  end: int(10), 
  type: 'int', 
  condition: '<' 
}, ({ i }) => {
  // ...
})
```

### Nested Loops

```tsx
Loop(10, 5, ({ i, j }) => {
  // i: 0-9, j: 0-4
})
```

### Backward Loop

```tsx
Loop({ start: 10 }, ({ i }) => {
  // Counts down from 10
})
```

### While-Style Loop

```tsx
Loop(value.lessThan(10), () => {
  value.addAssign(1)
})
```

### Loop Control

```tsx
Loop(100, ({ i }) => {
  If(condition, () => {
    Break()     // Exit loop
  })
  If(skipCondition, () => {
    Continue()  // Skip iteration
  })
})
```

## Math Functions

All available as `func(x)` OR `x.func()`:

### Basic

```tsx
abs(x)   sign(x)   floor(x)   ceil(x)   round(x)   trunc(x)   fract(x)
mod(x,y) min(x,y)  max(x,y)   clamp(x,min,max)   saturate(x)
```

### Interpolation

```tsx
mix(a, b, t)           // Linear interpolation
step(edge, x)          // Step function
smoothstep(e0, e1, x)  // Smooth step
```

### Trigonometry

```tsx
sin(x)  cos(x)  tan(x)  asin(x)  acos(x)  atan(y, x)  atan(x)
```

### Exponential

```tsx
pow(x, y)  exp(x)  exp2(x)  log(x)  log2(x)  sqrt(x)  inverseSqrt(x)
```

### Vector

```tsx
length(v)      distance(a, b)   dot(a, b)      cross(a, b)    normalize(v)
reflect(I, N)  refract(I, N, eta)  faceforward(N, I, Nref)
```

### Derivatives (Fragment Shader Only)

```tsx
dFdx(x)   dFdy(x)   fwidth(x)
```

### TSL Extras (Not in GLSL)

```tsx
oneMinus(x)            // 1 - x
negate(x)              // -x
saturate(x)            // clamp(x, 0, 1)
reciprocal(x)          // 1/x
cbrt(x)                // cube root
lengthSq(x)            // squared length (no sqrt, faster)
difference(x, y)       // abs(x - y)
equals(x, y)           // x == y
pow2(x)                // x^2
pow3(x)                // x^3
pow4(x)                // x^4
bitcast(x, type)       // Reinterpret bits as different type
transformDirection(v, m)  // Transform direction vector by matrix (no translation)
```

## Related

- [types.md](types.md) — Type constructors and conversions
- [functions.md](functions.md) — Fn() vs inline vs glslFn
- [optimization.md](optimization.md) — When to use .toVar()

