import type { WireframeFile, WireframeNode, WireframeSizing } from './wireframe-types'

// --- Sizing helpers ---

export function sizingToFlex(size: WireframeSizing | undefined): React.CSSProperties {
  if (size === 'fill') return { flex: 1, minWidth: 0, minHeight: 0 }
  if (size === 'hug' || size === undefined) return {}
  return {}
}

export function sizingToWidth(size: WireframeSizing | undefined): string | number | undefined {
  if (size === 'fill') return undefined // handled by flex
  if (size === 'hug' || size === undefined) return undefined
  return size
}

export function sizingToHeight(size: WireframeSizing | undefined): string | number | undefined {
  if (size === 'fill') return undefined
  if (size === 'hug' || size === undefined) return undefined
  return size
}

export function parsePadding(
  padding: number | [number, number] | [number, number, number, number] | undefined,
): string {
  if (padding === undefined) return '0'
  if (typeof padding === 'number') return `${padding}px`
  if (padding.length === 2) return `${padding[0]}px ${padding[1]}px`
  return `${padding[0]}px ${padding[1]}px ${padding[2]}px ${padding[3]}px`
}

// --- Tree query helpers ---

function findNodeParent(
  root: WireframeNode,
  nodeId: string,
): { parentId: string; index: number } | null {
  if (root.type !== 'frame') return null
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === nodeId) return { parentId: root.id, index: i }
  }
  for (const child of root.children) {
    const result = findNodeParent(child, nodeId)
    if (result) return result
  }
  return null
}

export function nodeHasEditableText(node: WireframeNode): boolean {
  return (
    node.type === 'text' ||
    node.type === 'button' ||
    node.type === 'input' ||
    node.type === 'dropdown' ||
    node.type === 'checkbox' ||
    node.type === 'toggle'
  )
}

function getEditableText(node: WireframeNode): string {
  switch (node.type) {
    case 'text':
    case 'button':
      return node.text
    case 'input':
    case 'dropdown':
      return node.placeholder ?? ''
    case 'checkbox':
    case 'toggle':
      return node.label
    default:
      return ''
  }
}

// --- Tree mutation helpers ---

function removeNodeFromTree(
  node: WireframeNode,
  nodeId: string,
): { tree: WireframeNode; removed: WireframeNode | null } {
  if (node.type !== 'frame') return { tree: node, removed: null }

  const idx = node.children.findIndex((c) => c.id === nodeId)
  if (idx !== -1) {
    const removed = node.children[idx]
    return {
      tree: { ...node, children: [...node.children.slice(0, idx), ...node.children.slice(idx + 1)] },
      removed,
    }
  }

  let removedNode: WireframeNode | null = null
  const newChildren = node.children.map((child) => {
    if (removedNode) return child
    const { tree, removed } = removeNodeFromTree(child, nodeId)
    if (removed) removedNode = removed
    return tree
  })

  return { tree: { ...node, children: newChildren }, removed: removedNode }
}

function insertNodeInTree(
  tree: WireframeNode,
  parentId: string,
  index: number,
  nodeToInsert: WireframeNode,
): WireframeNode {
  if (tree.type !== 'frame') return tree

  if (tree.id === parentId) {
    const newChildren = [...tree.children]
    newChildren.splice(index, 0, nodeToInsert)
    return { ...tree, children: newChildren }
  }

  return {
    ...tree,
    children: tree.children.map((child) => insertNodeInTree(child, parentId, index, nodeToInsert)),
  }
}

export function reorderNode(
  file: WireframeFile,
  nodeId: string,
  targetParentId: string,
  targetIndex: number,
): WireframeFile {
  const sourceInfo = findNodeParent(file.root, nodeId)
  if (!sourceInfo) return file

  let adjustedIndex = targetIndex
  if (sourceInfo.parentId === targetParentId && sourceInfo.index < targetIndex) {
    adjustedIndex -= 1
  }

  if (sourceInfo.parentId === targetParentId && sourceInfo.index === adjustedIndex) {
    return file
  }

  const { tree, removed } = removeNodeFromTree(file.root, nodeId)
  if (!removed) return file

  const newRoot = insertNodeInTree(tree, targetParentId, adjustedIndex, removed)
  return { ...file, root: newRoot }
}

export function updateNodeText(file: WireframeFile, nodeId: string, value: string): WireframeFile {
  return { ...file, root: updateNodeTextInTree(file.root, nodeId, value) }
}

function updateNodeTextInTree(node: WireframeNode, nodeId: string, value: string): WireframeNode {
  if (node.id === nodeId) {
    switch (node.type) {
      case 'text':
      case 'button':
        return { ...node, text: value }
      case 'input':
      case 'dropdown':
        return { ...node, placeholder: value }
      case 'checkbox':
      case 'toggle':
        return { ...node, label: value }
      default:
        return node
    }
  }
  if (node.type === 'frame') {
    return { ...node, children: node.children.map((child) => updateNodeTextInTree(child, nodeId, value)) }
  }
  return node
}

export function toggleNodeState(file: WireframeFile, nodeId: string): WireframeFile {
  return { ...file, root: toggleNodeStateInTree(file.root, nodeId) }
}

function toggleNodeStateInTree(node: WireframeNode, nodeId: string): WireframeNode {
  if (node.id === nodeId) {
    if (node.type === 'checkbox') return { ...node, checked: !node.checked }
    if (node.type === 'toggle') return { ...node, on: !node.on }
    return node
  }
  if (node.type === 'frame') {
    return { ...node, children: node.children.map((child) => toggleNodeStateInTree(child, nodeId)) }
  }
  return node
}

export function findNodeById(root: WireframeNode, id: string): WireframeNode | null {
  if (root.id === id) return root
  if (root.type === 'frame') {
    for (const child of root.children) {
      const found = findNodeById(child, id)
      if (found) return found
    }
  }
  return null
}
