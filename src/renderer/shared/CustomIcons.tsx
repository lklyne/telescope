import { useId, type ComponentProps } from 'react'

// Custom-drawn icons exported from the agent-canvas Figma file
// (file key hgwwoe0EzUrErdviULmRtb).
//
// Two flavors:
//   - Pen-popup icons (PenSlimIcon / PenMarkerIcon / StrokeThinIcon /
//     StrokeThickIcon): inline JSX because the pen icons take an `ink` prop
//     so the marker tip and cap can preview the active pen color.
//   - Toolbar icons (Select / Hand / Draw / AddSticky / AddShape / AddPage /
//     AddText / Comment / Inspect / Theme / ZoomChevron): rendered from raw
//     SVG assets in ./icons/toolbar/*.svg. The SVGs match the Figma frame
//     size exactly (20×20, 18×18 for comment/inspect, 12×12 for the zoom
//     chevron) with drop shadows stripped — shadows are reapplied via the
//     `filter: drop-shadow(...)` CSS on the toolbar `<img>` so each glyph
//     gets its own alpha-correct shadow instead of a bounding-box shadow.
//
// Re-extracting from Figma: see docs/adr/0013-popup-menus-v2.md §Icons for
// the per-node id table and an mcp__plugin_figma_figma__use_figma recipe.

import addPageUrl from './icons/toolbar/add-page.svg'
import addShapeUrl from './icons/toolbar/add-shape.svg'
import addStickyUrl from './icons/toolbar/add-sticky.svg'
import addTextUrl from './icons/toolbar/add-text.svg'
import commentUrl from './icons/toolbar/comment.svg'
import drawUrl from './icons/toolbar/draw.svg'
import handUrl from './icons/toolbar/hand.svg'
import inspectUrl from './icons/toolbar/inspect.svg'
import selectUrl from './icons/toolbar/select.svg'
import themeUrl from './icons/toolbar/theme.svg'
import zoomChevronUrl from './icons/toolbar/zoom-chevron.svg'

// ── Toolbar icons ──────────────────────────────────────────────────────────

type ToolbarIconProps = {
  size?: number
  className?: string
  style?: React.CSSProperties
}

function makeToolbarIcon(url: string, name: string) {
  // Render each glyph inside a fixed `size` × `size` box with object-fit:
  // contain so 18×18 (comment, inspect) and 12×12 (zoom chevron) SVGs sit
  // on the same nominal grid as the 20×20 ones at their natural Figma scale.
  const Icon = ({ size = 20, className, style }: ToolbarIconProps) => (
    <img
      src={url}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', ...style }}
    />
  )
  Icon.displayName = name
  return Icon
}

// Default size matches the 20×20 Figma toolbar slot.
export const SelectToolIcon = makeToolbarIcon(selectUrl, 'SelectToolIcon')
export const HandToolIcon = makeToolbarIcon(handUrl, 'HandToolIcon')
export const DrawToolIcon = makeToolbarIcon(drawUrl, 'DrawToolIcon')
export const AddStickyToolIcon = makeToolbarIcon(addStickyUrl, 'AddStickyToolIcon')
export const AddShapeToolIcon = makeToolbarIcon(addShapeUrl, 'AddShapeToolIcon')
export const AddPageToolIcon = makeToolbarIcon(addPageUrl, 'AddPageToolIcon')
export const AddTextToolIcon = makeToolbarIcon(addTextUrl, 'AddTextToolIcon')
export const CommentToolIcon = makeToolbarIcon(commentUrl, 'CommentToolIcon')
export const InspectToolIcon = makeToolbarIcon(inspectUrl, 'InspectToolIcon')
export const ThemeToolIcon = makeToolbarIcon(themeUrl, 'ThemeToolIcon')
export const ZoomChevronIcon = makeToolbarIcon(zoomChevronUrl, 'ZoomChevronIcon')

// ── Pen-popup icons (inline JSX so `ink` can theme dynamically) ────────────

type PenIconProps = {
  ink?: string
  size?: number
} & Omit<ComponentProps<'svg'>, 'width' | 'height' | 'viewBox'>

const DEFAULT_PEN_INK = '#BD4BE5'

export function PenSlimIcon({
  ink = DEFAULT_PEN_INK,
  size = 16,
  ...props
}: PenIconProps) {
  // Figma node 360:12 — 16×16 frame with the pen body extending past the
  // bottom and clipped. The `ink` prop drives the cap fill.
  const uid = useId()
  const maskId = `pen-slim-mask-${uid}`
  const maskGradId = `pen-slim-mask-grad-${uid}`
  const bodyGradId = `pen-slim-body-grad-${uid}`
  const shineGradId = `pen-slim-shine-grad-${uid}`
  const seamGradId = `pen-slim-seam-grad-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id={maskId}
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x="2"
        y="1"
        width="12"
        height="16"
      >
        <rect
          width="11.25"
          height="15.75"
          transform="matrix(1 0 0 -1 2 16.75)"
          fill={`url(#${maskGradId})`}
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          d="M9.5 5.40918C9.49999 6.08065 8.95565 6.62499 8.28418 6.625L6.96582 6.625C6.29435 6.62499 5.75001 6.08065 5.75 5.40918C5.75 5.27181 5.77376 5.13545 5.81934 5.00586L6.88477 1.97461C7.13063 1.27547 8.11937 1.27547 8.36523 1.97461L9.43066 5.00586C9.47623 5.13545 9.5 5.27181 9.5 5.40918Z"
          fill={ink}
          stroke="#797875"
          strokeWidth="0.75"
        />
        <path
          d="M12.125 12.6113L12.125 40.75C12.125 41.7855 11.2855 42.625 10.25 42.625L4.99999 42.625C3.96446 42.625 3.12499 41.7855 3.12499 40.75L3.125 12.6045C3.12503 12.3656 3.17088 12.129 3.25976 11.9072L5.21191 7.03906C5.48309 6.36293 6.11591 5.90562 6.82812 5.88574C7.3608 5.87089 7.85049 5.87141 8.38379 5.88672C9.09419 5.90712 9.72602 6.36038 10 7.03223L11.9863 11.9033C12.078 12.1281 12.125 12.3686 12.125 12.6113Z"
          fill={`url(#${bodyGradId})`}
          stroke="#797875"
          strokeWidth="0.75"
        />
        <path
          d="M9.57592 7.28068L11.75 12.25C10.6792 11.4254 9.11786 11.8382 8.59456 13.0842L8 14.5L8 6.25C8.68341 6.25 9.302 6.65457 9.57592 7.28068Z"
          fill={`url(#${shineGradId})`}
        />
        <rect x="7.25" y="6.25" width="0.75" height="9" fill={`url(#${seamGradId})`} />
      </g>
      <defs>
        <linearGradient id={maskGradId} x1="5.625" y1="0" x2="5.625" y2="15.75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D0CDCB" stopOpacity="0" />
          <stop offset="0.278846" stopColor="#D0CDCB" />
        </linearGradient>
        <linearGradient id={bodyGradId} x1="7.89091" y1="27.2601" x2="6.93068" y2="27.2601" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0F0F0" />
          <stop offset="1" stopColor="#F8F8F8" />
        </linearGradient>
        <linearGradient id={shineGradId} x1="9.38755" y1="6.33165" x2="10.8421" y2="12.6828" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8D8D8" />
          <stop offset="0.540027" stopColor="#DBDBDB" stopOpacity="0.2" />
          <stop offset="0.985392" stopColor="#DBDBDB" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={seamGradId} x1="7.625" y1="6.25" x2="7.625" y2="15.25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D9D9D9" stopOpacity="0.33" />
          <stop offset="1" stopColor="#B5B5B5" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function PenMarkerIcon({
  ink = DEFAULT_PEN_INK,
  size = 16,
  ...props
}: PenIconProps) {
  // Figma node 360:22 — 16×16 frame; cap, body, and tip rect take the ink
  // color. Body extends past the bottom and is clipped by the mask.
  const uid = useId()
  const maskId = `pen-marker-mask-${uid}`
  const maskGradId = `pen-marker-mask-grad-${uid}`
  const bodyGradId = `pen-marker-body-grad-${uid}`
  const shineGradId = `pen-marker-shine-grad-${uid}`
  const seamGradId = `pen-marker-seam-grad-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id={maskId}
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x="2"
        y="0"
        width="13"
        height="17"
      >
        <rect
          width="12"
          height="16.8"
          transform="matrix(1 0 0 -1 2.40039 16.7998)"
          fill={`url(#${maskGradId})`}
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          d="M10.5 4.55078C10.4998 5.40658 9.80602 6.10048 8.95019 6.10059L7.84961 6.10059C6.99388 6.10037 6.30002 5.40651 6.2998 4.55078L6.2998 3.35059C6.29988 3.03895 6.50628 2.76528 6.80566 2.67871L9.60547 1.86914C10.053 1.73978 10.4998 2.07524 10.5 2.54102L10.5 4.55078Z"
          fill={ink}
          stroke={ink}
        />
        <path
          d="M13.0996 12.3867L13.0996 42.4004C13.0996 43.4497 12.2486 44.3008 11.1992 44.3008L5.5996 44.3008C4.55026 44.3008 3.69921 43.4497 3.69921 42.4004L3.69922 12.3789C3.69925 12.1367 3.74578 11.8967 3.83594 11.6719L4.54199 9.91309C4.90888 8.99827 5.17809 8.04729 5.34668 7.07617L5.38867 6.83887C5.53997 5.96777 6.26471 5.32898 7.12598 5.3125C7.94758 5.29698 8.81329 5.29749 9.63477 5.31348C10.4938 5.33034 11.2187 5.96424 11.375 6.83105L11.4209 7.08594C11.5952 8.05266 11.8703 8.99862 12.2412 9.9082L12.959 11.6689C13.0519 11.8967 13.0996 12.1407 13.0996 12.3867Z"
          fill={`url(#${bodyGradId})`}
          stroke="#18181B"
        />
        <path
          d="M8.7998 5.80078L9.84127 5.80078C10.3274 5.80078 10.7426 6.15084 10.829 6.62924C11.515 10.4243 11.6502 9.94325 12.5 12.0007C11.5381 11.1467 10.0216 11.4914 9.52348 12.6775L8.7998 14.4007L8.7998 5.80078Z"
          fill={`url(#${shineGradId})`}
        />
        <rect
          x="12.4004"
          y="13"
          width="1"
          height="8"
          transform="rotate(90 12.4004 13)"
          fill={`url(#${seamGradId})`}
        />
        <rect x="4" y="13.5996" width="8.8" height="3.2" fill={ink} />
      </g>
      <defs>
        <linearGradient id={maskGradId} x1="6" y1="0" x2="6" y2="16.8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D0CDCB" stopOpacity="0" />
          <stop offset="0.278846" stopColor="#D0CDCB" />
        </linearGradient>
        <linearGradient id={bodyGradId} x1="8.68324" y1="28.0115" x2="7.659" y2="28.0115" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0F0F0" />
          <stop offset="1" stopColor="#F8F8F8" />
        </linearGradient>
        <linearGradient id={shineGradId} x1="10.2799" y1="5.68792" x2="11.8314" y2="12.4625" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8D8D8" />
          <stop offset="0.540027" stopColor="#DBDBDB" stopOpacity="0.2" />
          <stop offset="0.985392" stopColor="#DBDBDB" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={seamGradId} x1="12.9004" y1="13" x2="12.9004" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D9D9D9" stopOpacity="0.33" />
          <stop offset="1" stopColor="#B5B5B5" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function StrokeThinIcon(props: ComponentProps<'svg'>) {
  return (
    <svg
      width="17"
      height="9"
      viewBox="0 0 17 9"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M0.5 4.42123C2.49609 2.87695 3.99447 1.21776 5.99609 1.37695C9.99566 1.69504 3.4279 8.75642 8.49772 8.49268C12.4961 8.28467 10.5 0.5 16.5 0.5"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function StrokeThickIcon(props: ComponentProps<'svg'>) {
  return (
    <svg
      width="19"
      height="11"
      viewBox="0 0 19 11"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M1.5 5.42123C3.49609 3.87695 4.99447 2.21776 6.99609 2.37695C10.9957 2.69504 4.4279 9.75642 9.49772 9.49268C13.4961 9.28467 11.5 1.5 17.5 1.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
