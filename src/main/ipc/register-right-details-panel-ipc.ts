import { ipcMain } from 'electron'
import type { AnnotationCreateRequest, EdgeEnd, EdgeSide } from '../../shared/types'
import {
  deleteEdge,
  updateEdge,
  setFramePreset,
  setFrameCustom,
  setDeviceOrientation,
  toggleDeviceShell,
  toggleSvgDeviceShell,
  setFilePreset,
  setFileCustom,
  setFileDeviceOrientation,
  toggleFileDeviceShell,
} from '../runtime/document-commands'
import { navigateFramePage, togglePageLinked } from '../navigation-sync'
import { deleteFrames } from '../workspace-entities'
import { duplicateFrameFromSource } from '../workspace-frames'
import {
  dismissBrowserDevTools,
  openDevToolsForSelectedPage,
  openInspectPanel,
  selectPageById,
  setInspectNodeFromPanel,
  setSelectedInspectNodeById,
  setSelectedInspectTarget,
} from '../runtime/ui-actions'
import {
  addAnnotationReply,
  createAnnotation,
  deleteAnnotation,
  updateAnnotationStatus,
} from '../workspace-annotations'
import { pages } from '../runtime/page-runtime'

type ComponentPropOverridePayload = {
  frameId: string
  componentId: string
  propPath: string[]
  value: unknown
}

type ComponentTokenOverridePayload = {
  frameId: string
  componentId?: string
  token: string
  value: string
  selector?: string
}

function forwardOverrideToFrame(
  frameId: string,
  channel: 'override-props' | 'override-token',
  payload: Record<string, unknown>,
): void {
  const page = pages.find((candidate) => candidate.id === frameId)
  if (!page || page.pageView.webContents.isDestroyed()) return
  page.pageView.webContents.send(channel, payload)
}

export function registerRightDetailsPanelIpc(): void {
  ipcMain.on('right-details-panel-open-browser-devtools', () => {
    openDevToolsForSelectedPage()
  })

  ipcMain.on('right-details-panel-dismiss-browser-devtools', () => {
    dismissBrowserDevTools()
  })

  ipcMain.on('right-details-panel-clear-inspect-selection', () => {
    setSelectedInspectTarget(null)
  })

  ipcMain.on(
    'right-details-panel-select-frame',
    (_event, payload: { frameId?: string } | undefined) => {
      const frameId = payload?.frameId?.trim()
      if (!frameId) return
      selectPageById(frameId)
    },
  )

  ipcMain.on(
    'right-details-panel-hover-node',
    (_event, { frameId, nodeId }: { frameId: string; nodeId: string | null }) => {
      if (!frameId) return
      setInspectNodeFromPanel(frameId, nodeId, false)
    },
  )

  ipcMain.on(
    'right-details-panel-select-node',
    (_event, { frameId, nodeId }: { frameId: string; nodeId: string | null }) => {
      if (!frameId) return
      if (selectPageById(frameId)) {
        openInspectPanel()
      }
      setSelectedInspectNodeById(frameId, nodeId)
      setInspectNodeFromPanel(frameId, nodeId, true)
    },
  )

  ipcMain.on(
    'right-details-panel-edit-component-prop',
    (
      _event,
      { frameId, componentId, propPath, value }: ComponentPropOverridePayload,
    ) => {
      forwardOverrideToFrame(frameId, 'override-props', {
        componentId,
        propPath,
        value,
      })
    },
  )

  ipcMain.on(
    'right-details-panel-edit-component-token',
    (
      _event,
      { frameId, componentId, token, value, selector }: ComponentTokenOverridePayload,
    ) => {
      forwardOverrideToFrame(frameId, 'override-token', {
        componentId,
        token,
        value,
        selector,
      })
    },
  )

  ipcMain.on(
    'right-details-panel-create-annotation',
    (_event, request: AnnotationCreateRequest) => {
      createAnnotation(request)
    },
  )

  ipcMain.on(
    'right-details-panel-reply-annotation',
    (_event, payload: { annotationId?: string; text?: string } | undefined) => {
      const annotationId = payload?.annotationId?.trim()
      const text = payload?.text?.trim()
      if (!annotationId || !text) return
      addAnnotationReply(annotationId, 'user', text)
    },
  )

  ipcMain.on(
    'right-details-panel-resolve-annotation',
    (_event, payload: { annotationId?: string } | undefined) => {
      const annotationId = payload?.annotationId?.trim()
      if (!annotationId) return
      updateAnnotationStatus(annotationId, 'resolved')
    },
  )

  ipcMain.on(
    'right-details-panel-delete-annotation',
    (_event, payload: { annotationId?: string } | undefined) => {
      const annotationId = payload?.annotationId?.trim()
      if (!annotationId) return
      deleteAnnotation(annotationId)
    },
  )

  ipcMain.on(
    'right-details-panel-update-edge',
    (_event, payload: { id: string; patch: { fromEnd?: EdgeEnd; toEnd?: EdgeEnd; fromSide?: EdgeSide; toSide?: EdgeSide; color?: string; label?: string } }) => {
      if (!payload?.id) return
      updateEdge(payload.id, payload.patch)
    },
  )

  ipcMain.on(
    'right-details-panel-delete-edge',
    (_event, payload: { id: string }) => {
      if (!payload?.id) return
      deleteEdge(payload.id)
    },
  )

  // --- Device Frame ---

  ipcMain.on(
    'right-details-panel-set-frame-preset',
    (_event, payload: { frameId: string; presetIndex: number }) => {
      if (!payload?.frameId || typeof payload.presetIndex !== 'number') return
      setFramePreset(payload.frameId, payload.presetIndex)
    },
  )

  ipcMain.on(
    'right-details-panel-set-frame-custom',
    (_event, payload: { frameId: string }) => {
      if (!payload?.frameId) return
      setFrameCustom(payload.frameId)
    },
  )

  ipcMain.on(
    'right-details-panel-set-device-orientation',
    (_event, payload: { frameId: string; orientation: string }) => {
      if (!payload?.frameId) return
      if (payload.orientation !== 'portrait' && payload.orientation !== 'landscape') return
      setDeviceOrientation(payload.frameId, payload.orientation)
    },
  )

  ipcMain.on(
    'right-details-panel-toggle-device-shell',
    (_event, payload: { frameId: string }) => {
      if (!payload?.frameId) return
      toggleDeviceShell(payload.frameId)
    },
  )

  ipcMain.on(
    'right-details-panel-toggle-svg-device-shell',
    (_event, payload: { frameId: string }) => {
      if (!payload?.frameId) return
      toggleSvgDeviceShell(payload.frameId)
    },
  )

  // --- File Device Settings ---

  ipcMain.on(
    'right-details-panel-set-file-preset',
    (_event, payload: { fileId: string; presetIndex: number }) => {
      if (!payload?.fileId || typeof payload.presetIndex !== 'number') return
      setFilePreset(payload.fileId, payload.presetIndex)
    },
  )

  ipcMain.on(
    'right-details-panel-set-file-custom',
    (_event, payload: { fileId: string }) => {
      if (!payload?.fileId) return
      setFileCustom(payload.fileId)
    },
  )

  ipcMain.on(
    'right-details-panel-set-file-device-orientation',
    (_event, payload: { fileId: string; orientation: string }) => {
      if (!payload?.fileId) return
      if (payload.orientation !== 'portrait' && payload.orientation !== 'landscape') return
      setFileDeviceOrientation(payload.fileId, payload.orientation)
    },
  )

  ipcMain.on(
    'right-details-panel-toggle-file-device-shell',
    (_event, payload: { fileId: string }) => {
      if (!payload?.fileId) return
      toggleFileDeviceShell(payload.fileId)
    },
  )

  // --- Frame navigation & actions ---

  ipcMain.on(
    'right-details-panel-navigate-frame',
    (_event, payload: { frameId: string; url: string }) => {
      const page = pages.find((p) => p.id === payload?.frameId)
      if (!page) return
      navigateFramePage(page, { type: 'load-url', url: payload.url })
    },
  )

  ipcMain.on(
    'right-details-panel-go-back-frame',
    (_event, payload: { frameId: string }) => {
      const page = pages.find((p) => p.id === payload?.frameId)
      if (!page) return
      navigateFramePage(page, { type: 'go-back', fallbackUrl: page.pageView.webContents.getURL() })
    },
  )

  ipcMain.on(
    'right-details-panel-go-forward-frame',
    (_event, payload: { frameId: string }) => {
      const page = pages.find((p) => p.id === payload?.frameId)
      if (!page) return
      navigateFramePage(page, { type: 'go-forward', fallbackUrl: page.pageView.webContents.getURL() })
    },
  )

  ipcMain.on(
    'right-details-panel-reload-frame',
    (_event, payload: { frameId: string }) => {
      const page = pages.find((p) => p.id === payload?.frameId)
      if (!page) return
      navigateFramePage(page, { type: 'reload', fallbackUrl: page.pageView.webContents.getURL() })
    },
  )

  ipcMain.on(
    'right-details-panel-duplicate-frame',
    (_event, payload: { frameId: string }) => {
      if (!payload?.frameId) return
      if (!pages.some((p) => p.id === payload.frameId)) return
      duplicateFrameFromSource({ sourceFrameId: payload.frameId })
    },
  )

  ipcMain.on(
    'right-details-panel-toggle-linked-frame',
    (_event, payload: { frameId: string }) => {
      const page = pages.find((p) => p.id === payload?.frameId)
      if (!page) return
      togglePageLinked(page)
    },
  )

  ipcMain.on(
    'right-details-panel-delete-frame',
    (_event, payload: { frameId: string }) => {
      if (!payload?.frameId) return
      if (!pages.some((p) => p.id === payload.frameId)) return
      deleteFrames({ frameIds: [payload.frameId] })
    },
  )
}
