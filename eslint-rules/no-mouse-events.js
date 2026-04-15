/**
 * no-mouse-events
 *
 * Forbids legacy mouse events in src/renderer/. Pointer events only
 * (spec §6 I8). Mouse events don't carry pointerType/pointerId and
 * don't support setPointerCapture, so they can't express the gesture
 * primitives our useDragGesture hook requires.
 */
'use strict'

const FORBIDDEN_TYPES = new Set([
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
])

const FORBIDDEN_JSX_PROPS = new Set([
  'onMouseDown',
  'onMouseUp',
  'onMouseMove',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOver',
  'onMouseOut',
])

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow mouse events in renderer code. Use pointer events + useDragGesture instead.',
    },
    messages: {
      forbiddenEvent:
        "'{{name}}' mouse event is forbidden in renderer code. Use pointer events + useDragGesture instead (spec §6 I8).",
      forbiddenProp:
        "'{{name}}' JSX prop is forbidden in renderer code. Use onPointer* via useDragGesture (spec §6 I8).",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (!filename.includes('/src/renderer/')) return {}

    return {
      // addEventListener('mousedown', ...) and ('mousedown')
      Literal(node) {
        if (typeof node.value !== 'string') return
        if (!FORBIDDEN_TYPES.has(node.value)) return
        // Only flag when it's the first arg of addEventListener / removeEventListener
        const parent = node.parent
        if (parent?.type !== 'CallExpression') return
        if (parent.arguments[0] !== node) return
        const callee = parent.callee
        if (callee?.type !== 'MemberExpression') return
        if (callee.property.type !== 'Identifier') return
        const calleeName = callee.property.name
        if (calleeName !== 'addEventListener' && calleeName !== 'removeEventListener') return

        context.report({
          node,
          messageId: 'forbiddenEvent',
          data: { name: node.value },
        })
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return
        const name = node.name.name
        if (!FORBIDDEN_JSX_PROPS.has(name)) return
        context.report({
          node: node.name,
          messageId: 'forbiddenProp',
          data: { name },
        })
      },
    }
  },
}
