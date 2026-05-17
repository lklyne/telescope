/**
 * remark plugin: render a single newline as a hard line break.
 *
 * CommonMark collapses a lone `\n` into a space, but the CodeMirror
 * markdown editor shows one physical line per newline. Without this,
 * Enter-presses vanish when a text/sticky body swaps from edit to view
 * mode. Equivalent to the `remark-breaks` package, inlined to avoid a
 * dependency. Only `text` nodes are split, so `code` / `inlineCode`
 * content is left intact.
 */

interface MdastNode {
  type: string
  value?: string
  children?: MdastNode[]
}

export function remarkLineBreaks() {
  return (tree: MdastNode): void => {
    splitTextChildren(tree)
  }
}

function splitTextChildren(node: MdastNode): void {
  if (!node.children) return
  const next: MdastNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && child.value && /\r?\n/.test(child.value)) {
      const segments = child.value.split(/\r?\n/)
      segments.forEach((segment, index) => {
        if (index > 0) next.push({ type: 'break' })
        if (segment) next.push({ type: 'text', value: segment })
      })
    } else {
      splitTextChildren(child)
      next.push(child)
    }
  }
  node.children = next
}
