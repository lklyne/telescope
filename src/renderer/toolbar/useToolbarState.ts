import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AgentPresenceCursor, AnnotationMode, ToolbarSelectionData } from '../../shared/types'
import { toolbarApi } from './toolbarApi'

export const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200] as const

const EMPTY_SELECTION: ToolbarSelectionData = {
  activeFrameId: null,
  selectedEntityIds: [],
  selectionCount: 0,
  availableFrameCount: 0,
  displayUrl: '',
  placeholder: '',
  canGoBack: false,
  canGoForward: false,
  isLoadingActiveFrame: false,
  loadingFrameCount: 0,
  isLoadingAnySelected: false,
  loadingPhase: 'idle',
  activeTabId: null,
  activeTabName: null,
  focusedEntityId: null,
  pendingPlacementActive: false,
}

export interface ToolbarState {
  zoomPercent: number
  leftSidebarOpen: boolean
  devtoolsOpen: boolean
  inspectEnabled: boolean
  inspectAvailable: boolean
  annotationMode: AnnotationMode
  annotateAvailable: boolean
  selection: ToolbarSelectionData
  addressValue: string
  setAddressValue: Dispatch<SetStateAction<string>>
  addressBarRef: RefObject<HTMLInputElement | null>
  currentPresetValue: (typeof ZOOM_PRESETS)[number] | null
  hasSelection: boolean
  hasFrames: boolean
  isFocused: boolean
  defaultToolActive: boolean
  agentCursors: AgentPresenceCursor[]
}

export function useToolbarState(): ToolbarState {
  const [zoomPercent, setZoomPercent] = useState(100)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [devtoolsOpen, setDevtoolsOpen] = useState(false)
  const [inspectEnabled, setInspectEnabled] = useState(false)
  const [inspectAvailable, setInspectAvailable] = useState(false)
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('off')
  const [annotateAvailable, setAnnotateAvailable] = useState(false)
  const [selection, setSelection] = useState<ToolbarSelectionData>(EMPTY_SELECTION)
  const [addressValue, setAddressValue] = useState('')
  const [agentCursors, setAgentCursors] = useState<AgentPresenceCursor[]>([])
  const addressBarRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const cleanupZoom = toolbarApi.onZoomChanged((value) => {
      setZoomPercent(value)
    })
    const cleanupSelection = toolbarApi.onSelectionChanged((data) => {
      setSelection(data)
      setAddressValue(data.displayUrl)
    })
    const cleanupLeftSidebar = toolbarApi.onLeftSidebarChanged((open) => setLeftSidebarOpen(open))
    const cleanupDevtools = toolbarApi.onDevtoolsChanged((open) => setDevtoolsOpen(open))
    const cleanupInspect = toolbarApi.onInspectStateChanged((state) => {
      setInspectEnabled(state.enabled)
      setInspectAvailable(state.available)
    })
    const cleanupAnnotate = toolbarApi.onAnnotateStateChanged((state) => {
      setAnnotationMode(state.mode)
      setAnnotateAvailable(state.available)
    })
    const cleanupPresence = toolbarApi.onAgentPresenceChanged((cursors) => {
      setAgentCursors(cursors)
    })
    let focusTimer: ReturnType<typeof setTimeout> | undefined
    const cleanupFocusAddress = toolbarApi.onFocusAddressBar(() => {
      clearTimeout(focusTimer)
      focusTimer = setTimeout(() => {
        addressBarRef.current?.focus()
        addressBarRef.current?.select()
      }, 50)
    })

    return () => {
      cleanupZoom()
      cleanupSelection()
      cleanupLeftSidebar()
      cleanupDevtools()
      cleanupInspect()
      cleanupAnnotate()
      cleanupPresence()
      cleanupFocusAddress()
      clearTimeout(focusTimer)
    }
  }, [])

  const currentPresetValue = ZOOM_PRESETS.includes(zoomPercent as (typeof ZOOM_PRESETS)[number])
    ? (zoomPercent as (typeof ZOOM_PRESETS)[number])
    : null
  const hasSelection = selection.selectionCount > 0
  const hasFrames = selection.availableFrameCount > 0
  const isFocused = selection.focusedEntityId !== null
  const defaultToolActive = !inspectEnabled && annotationMode === 'off'

  return {
    zoomPercent,
    leftSidebarOpen,
    devtoolsOpen,
    inspectEnabled,
    inspectAvailable,
    annotationMode,
    annotateAvailable,
    selection,
    addressValue,
    setAddressValue,
    addressBarRef,
    currentPresetValue,
    hasSelection,
    hasFrames,
    isFocused,
    defaultToolActive,
    agentCursors,
  }
}
