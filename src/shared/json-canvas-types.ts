/**
 * TypeScript types for the JSON Canvas specification v1.0
 * https://jsoncanvas.org/
 * https://github.com/obsidianmd/jsoncanvas/blob/main/spec/1.0.md
 */

// --- Colors ---

/** Preset color "1"–"6" (red, orange, yellow, green, cyan, purple) or hex "#RRGGBB" */
export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | (string & {})

// --- Nodes ---

export interface JsonCanvasNodeBase {
  id: string
  type: 'text' | 'link' | 'file' | 'group' | 'drawing'
  x: number
  y: number
  width: number
  height: number
  color?: CanvasColor
}

export interface JsonCanvasTextNode extends JsonCanvasNodeBase {
  type: 'text'
  text: string
}

export interface JsonCanvasLinkNode extends JsonCanvasNodeBase {
  type: 'link'
  url: string
  // App-specific extensions (other tools ignore per spec extensibility model)
  presetIndex?: number
  linked?: boolean
  label?: string
  source?: string
  groupId?: string
  parentGroupId?: string
  metadata?: Record<string, unknown>
}

export interface JsonCanvasFileNode extends JsonCanvasNodeBase {
  type: 'file'
  file: string
  subpath?: string
}

export interface JsonCanvasGroupNode extends JsonCanvasNodeBase {
  type: 'group'
  label?: string
  background?: string
  backgroundStyle?: 'cover' | 'ratio' | 'repeat'
  // App-specific extensions
  groupKind?: string
  layoutMode?: string
  frameIds?: string[]
  entityIds?: string[]
  parentGroupId?: string
  managedLayout?: boolean
  groupColor?: string
  sourceTaskId?: string
  groupMetadata?: Record<string, unknown>
}

/**
 * Drawing node (Telescope extension). Other JSON Canvas tools ignore
 * unknown `type` values per the spec's extensibility model.
 */
export interface JsonCanvasDrawingNode extends JsonCanvasNodeBase {
  type: 'drawing'
  strokes: AnnotationDrawingStroke[]
  label?: string
  parentGroupId?: string
}

export type JsonCanvasNode =
  | JsonCanvasTextNode
  | JsonCanvasLinkNode
  | JsonCanvasFileNode
  | JsonCanvasGroupNode
  | JsonCanvasDrawingNode

// --- Edges ---

import type { AnnotationDrawingStroke, EdgeSide, EdgeEnd } from './types'
export type { EdgeSide, EdgeEnd }

export interface JsonCanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: EdgeSide
  toSide?: EdgeSide
  fromEnd?: EdgeEnd
  toEnd?: EdgeEnd
  color?: CanvasColor
  label?: string
  // App-specific extensions
  edgeKind?: string
  edgeMetadata?: Record<string, unknown>
}

// --- Document ---

export interface JsonCanvasDocument {
  nodes: JsonCanvasNode[]
  edges: JsonCanvasEdge[]
  // App-specific extensions (other tools ignore per spec)
  annotations?: unknown[]
  appState?: JsonCanvasAppState
}

export interface JsonCanvasAppState {
  zoom: number
  pan: { x: number; y: number }
  selectedEntityIds?: string[]
  leftSidebarOpen?: boolean
  devtoolsOpen?: boolean
  devtoolsPanelTab?: string
  devtoolsWidth?: number
  browserTabMode?: string
}
