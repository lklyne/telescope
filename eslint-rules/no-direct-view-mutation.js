/**
 * no-direct-view-mutation
 *
 * Forbids direct WebContentsView mutation calls — setBounds, setVisible,
 * addChildView, removeChildView — outside the two files that own the
 * layout pass: src/main/runtime/layout-engine.ts and
 * src/main/runtime/layer-stack.ts.
 *
 * Spec §6 I1: a single layout pass is the only site that mutates view
 * bounds / visibility / child lists. Mutation elsewhere fragments the
 * authority and causes bounds drift bugs.
 */
'use strict'

const FORBIDDEN_METHODS = new Set([
  'setBounds',
  'setVisible',
  'addChildView',
  'removeChildView',
])

const ALLOWED_FILES = [
  'src/main/runtime/layout-engine.ts',
  'src/main/runtime/layer-stack.ts',
]

function isAllowedFile(filename) {
  return ALLOWED_FILES.some((allowed) => filename.endsWith(allowed))
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct WebContentsView / BaseWindow child-view mutation outside the layout pass.',
    },
    messages: {
      forbidden:
        "'{{name}}()' mutates view state. Route through layout-engine / layer-stack: set markDirty() and call layoutAllViews() / requestLayout() instead.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (isAllowedFile(filename)) return {}

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        if (callee.computed) return
        if (callee.property.type !== 'Identifier') return
        const name = callee.property.name
        if (!FORBIDDEN_METHODS.has(name)) return

        // Skip when the receiver is the `win` identifier. `win` is the
        // BaseWindow itself — `win.setBounds(...)` resizes the OS window
        // (recording.ts, workspace-restore.ts), which was never a
        // child-view mutation the layout pass owns. Child-view mutations
        // go through `win.contentView` (a MemberExpression receiver), so
        // those are still caught.
        if (callee.object.type === 'Identifier' && callee.object.name === 'win')
          return

        context.report({
          node: callee.property,
          messageId: 'forbidden',
          data: { name },
        })
      },
    }
  },
}
