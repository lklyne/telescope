import type { Dispatch, SetStateAction } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { InspectNodeSummary } from '../../../shared/types'
import { rightDetailsPanelApi } from '../rightDetailsPanelApi'
import { CommentBadgeIcon } from '../../shared/PanelIcons'

const LIST_OUTER_LEFT_PADDING = 8
const LIST_OUTER_RIGHT_PADDING = 0
const LIST_ROW_INNER_X_PADDING = 8
const LIST_ROW_INNER_Y_PADDING = 6
const TREE_DEPTH_STEP = 12

function InspectTreeNode({
  node,
  frameId,
  nodesById,
  unresolvedCountsByNodeId,
  expanded,
  setExpanded,
  depth,
  hoveredNodeId,
  selectedNodeId,
  registerNodeElement,
}: {
  node: InspectNodeSummary
  frameId: string
  nodesById: Record<string, InspectNodeSummary>
  unresolvedCountsByNodeId: Map<string, number>
  expanded: Set<string>
  setExpanded: Dispatch<SetStateAction<Set<string>>>
  depth: number
  hoveredNodeId: string | null
  selectedNodeId: string | null
  registerNodeElement: (nodeId: string, element: HTMLButtonElement | null) => void
}) {
  const hasChildren = node.childrenIds.length > 0
  const isExpanded = expanded.has(node.id)
  const isHovered = hoveredNodeId === node.id
  const isSelected = selectedNodeId === node.id
  const unresolvedCount = unresolvedCountsByNodeId.get(node.id) ?? 0
  const indentOffset = LIST_OUTER_LEFT_PADDING + depth * TREE_DEPTH_STEP + 2
  const contentOffset =
    LIST_OUTER_LEFT_PADDING + LIST_ROW_INNER_X_PADDING + depth * TREE_DEPTH_STEP + 16
  const rowClassName = `group relative w-full border border-transparent text-[12px] leading-4 ${
    isSelected
      ? 'bg-[var(--surface-interactive)] text-zinc-900 hover:bg-[var(--surface-interactive)] dark:text-zinc-100 dark:hover:bg-[var(--surface-interactive)]'
      : isHovered
        ? 'bg-[var(--surface-interactive-hover)] text-zinc-900 dark:text-zinc-100'
        : 'text-zinc-800 hover:bg-[var(--surface-interactive-hover)] dark:text-zinc-200 dark:hover:bg-[var(--surface-interactive-hover)]'
  }`
  const rowButtonClassName =
    'flex w-full items-center gap-1.5 text-left font-normal focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500'

  const handleSelect = () => {
    if (isSelected) {
      rightDetailsPanelApi.clearInspectSelection()
      rightDetailsPanelApi.setInspectHoverNode(frameId, node.id)
      return
    }
    rightDetailsPanelApi.setInspectSelectedNode(frameId, node.id)
  }

  const rowButton = (
    <button
      type="button"
      ref={(element) => registerNodeElement(node.id, element)}
      className={rowButtonClassName}
      style={{
        paddingLeft: `${contentOffset}px`,
        paddingRight: `${LIST_OUTER_RIGHT_PADDING + LIST_ROW_INNER_X_PADDING}px`,
        paddingTop: `${LIST_ROW_INNER_Y_PADDING}px`,
        paddingBottom: `${LIST_ROW_INNER_Y_PADDING}px`,
      }}
      onClick={handleSelect}
    >
      <span className="truncate">{node.name}</span>
      {node.dsComponentName ? (
        <span className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
          {node.dsComponentName}
        </span>
      ) : null}
      {unresolvedCount > 0 ? (
        <span
          className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-amber-500/50 px-1 py-0.5 text-[9px] text-amber-600 dark:text-amber-400"
          title={`${unresolvedCount} unresolved message${unresolvedCount === 1 ? '' : 's'}`}
        >
          <CommentBadgeIcon className="size-2.5" />
          {unresolvedCount > 9 ? '9+' : unresolvedCount}
        </span>
      ) : null}
      {node.hasSource ? (
        <span
          className={`${unresolvedCount > 0 ? 'ml-1' : 'ml-auto'} size-1.5 shrink-0 rounded-full bg-emerald-500`}
          title="Has source"
        />
      ) : null}
    </button>
  )

  if (!hasChildren) {
    return (
      <div
        className={rowClassName}
        onMouseEnter={() => rightDetailsPanelApi.setInspectHoverNode(frameId, node.id)}
        onMouseLeave={() => rightDetailsPanelApi.setInspectHoverNode(frameId, null)}
      >
        {rowButton}
      </div>
    )
  }

  return (
    <Collapsible.Root
      open={isExpanded}
      onOpenChange={(open) => {
        setExpanded((prev) => {
          const next = new Set(prev)
          if (open) next.add(node.id)
          else next.delete(node.id)
          return next
        })
      }}
    >
      <div
        className={rowClassName}
        onMouseEnter={() => rightDetailsPanelApi.setInspectHoverNode(frameId, node.id)}
        onMouseLeave={() => rightDetailsPanelApi.setInspectHoverNode(frameId, null)}
      >
        <Collapsible.Trigger
          className="absolute top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center text-zinc-500 hover:bg-[var(--surface-interactive-hover)] hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-zinc-300 dark:hover:bg-[var(--surface-interactive-hover)] dark:hover:text-zinc-100"
          style={{ left: `${indentOffset}px` }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </Collapsible.Trigger>
        {rowButton}
      </div>
      <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-all ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 duration-150 [&[hidden]:not([hidden='until-found'])]:hidden">
        {node.childrenIds.map((childId) => {
          const child = nodesById[childId]
          if (!child) return null
          return (
            <InspectTreeNode
              key={child.id}
              node={child}
              frameId={frameId}
              nodesById={nodesById}
              unresolvedCountsByNodeId={unresolvedCountsByNodeId}
              expanded={expanded}
              setExpanded={setExpanded}
              depth={depth + 1}
              hoveredNodeId={hoveredNodeId}
              selectedNodeId={selectedNodeId}
              registerNodeElement={registerNodeElement}
            />
          )
        })}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export function InspectTree(props: {
  treeRootIds: string[]
  activeFrameId: string
  nodesById: Record<string, InspectNodeSummary>
  unresolvedCountsByNodeId: Map<string, number>
  expanded: Set<string>
  setExpanded: Dispatch<SetStateAction<Set<string>>>
  hoveredNodeId: string | null
  selectedNodeId: string | null
  registerNodeElement: (nodeId: string, element: HTMLButtonElement | null) => void
}) {
  const {
    treeRootIds,
    activeFrameId,
    nodesById,
    unresolvedCountsByNodeId,
    expanded,
    setExpanded,
    hoveredNodeId,
    selectedNodeId,
    registerNodeElement,
  } = props

  return (
    <>
      {treeRootIds.map((rootId) => {
        const node = nodesById[rootId]
        if (!node) return null
        return (
          <InspectTreeNode
            key={rootId}
            node={node}
            frameId={activeFrameId}
            nodesById={nodesById}
            unresolvedCountsByNodeId={unresolvedCountsByNodeId}
            expanded={expanded}
            setExpanded={setExpanded}
            depth={0}
            hoveredNodeId={hoveredNodeId}
            selectedNodeId={selectedNodeId}
            registerNodeElement={registerNodeElement}
          />
        )
      })}
    </>
  )
}
