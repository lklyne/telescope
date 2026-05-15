import type { ComponentProps } from 'react'

// Custom-drawn icons exported from the agent-canvas Figma file
// (file key hgwwoe0EzUrErdviULmRtb). These are the Specular-specific
// glyphs that don't ship with lucide-react. Standard icons (copy, trash,
// chevrons, etc.) continue to come from lucide-react.
//
// Figma source nodes:
//   PenSlimIcon    → 360:12   (and 360:67 dark variant; same vector)
//   PenMarkerIcon  → 360:22   (and 360:77 dark variant; same vector)
//   StrokeThinIcon → 360:37   (and 360:91 dark variant; same vector)
//   StrokeThickIcon → 360:39  (and 360:93 dark variant; same vector)
//
// Pen icons accept an `ink` prop to swap the marker-tip / cap color so
// the brush variant button can preview the active pen color. Default is
// the design's #BD4BE5 purple so the icon renders verbatim when used
// without a color binding.

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
  // Natural Figma export is 16 wide × 24 tall (the cap fades into alpha
  // via a mask). Render at native ratio so the soft bottom fade reads.
  const height = (size * 24) / 16
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 16 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id="pen-slim-mask"
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
          fill="url(#pen-slim-mask-grad)"
        />
      </mask>
      <g mask="url(#pen-slim-mask)">
        <g filter="url(#pen-slim-inner-cap)">
          <path
            d="M9.07738 5.13022C9.1089 5.21984 9.125 5.31416 9.125 5.40916C9.125 5.87354 8.74854 6.25 8.28416 6.25L6.96584 6.25C6.50146 6.25 6.125 5.87354 6.125 5.40916C6.125 5.31416 6.1411 5.21984 6.17262 5.13022L7.23853 2.09903C7.36689 1.734 7.88311 1.734 8.01147 2.09903L9.07738 5.13022Z"
            fill={ink}
          />
        </g>
        <path
          d="M9.5 5.40918C9.49999 6.08065 8.95565 6.62499 8.28418 6.625L6.96582 6.625C6.29435 6.62499 5.75001 6.08065 5.75 5.40918C5.75 5.27181 5.77377 5.13545 5.81934 5.00586L6.88477 1.97461C7.13063 1.27547 8.11937 1.27547 8.36523 1.97461L9.43066 5.00586C9.47623 5.13545 9.5 5.27181 9.5 5.40918Z"
          stroke="#797875"
          strokeWidth="0.75"
        />
        <g filter="url(#pen-slim-inner-body)">
          <path
            d="M6.8173 5.51101C7.35735 5.49594 7.85423 5.49643 8.39461 5.51194C9.26082 5.53681 10.0197 6.08807 10.3469 6.89048L12.3334 11.7619C12.4434 12.0316 12.5 12.3202 12.5 12.6115L12.5 40.75C12.5 41.9926 11.4926 43 10.25 43L5 43C3.75736 43 2.75 41.9926 2.75 40.75L2.75001 12.6048C2.75001 12.3178 2.80489 12.0335 2.91171 11.7672L4.86406 6.89939C5.18785 6.09209 5.94782 5.53527 6.8173 5.51101Z"
            fill="url(#pen-slim-body-grad)"
          />
        </g>
        <path
          d="M12.125 12.6113L12.125 40.75C12.125 41.7855 11.2855 42.625 10.25 42.625L4.99999 42.625C3.96446 42.625 3.12499 41.7855 3.12499 40.75L3.125 12.6045C3.12503 12.3656 3.17088 12.129 3.25976 11.9072L5.21191 7.03906C5.48309 6.36293 6.11591 5.90562 6.82812 5.88574C7.3608 5.87089 7.85049 5.87141 8.38379 5.88672C9.09419 5.90712 9.72602 6.36038 10 7.03223L11.9863 11.9033C12.078 12.1281 12.125 12.3686 12.125 12.6113Z"
          stroke="#797875"
          strokeWidth="0.75"
        />
        <path
          d="M9.57592 7.28068L11.75 12.25C10.6792 11.4254 9.11786 11.8382 8.59456 13.0842L8 14.5L8 6.25C8.68341 6.25 9.302 6.65457 9.57592 7.28068Z"
          fill="url(#pen-slim-shine-grad)"
        />
        <rect
          x="7.25"
          y="6.25"
          width="0.75"
          height="9"
          fill="url(#pen-slim-seam-grad)"
        />
      </g>
      <defs>
        <filter
          id="pen-slim-inner-cap"
          x="4.625"
          y="1.0752"
          width="5.25"
          height="5.9248"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="-3" />
          <feGaussianBlur stdDeviation="0.375" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2={-1} k3={1} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
          />
          <feBlend in2="shape" result="effect1_innerShadow" />
        </filter>
        <filter
          id="pen-slim-inner-body"
          x="2.75"
          y="5.5"
          width="9.75"
          height="37.5"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="0.75" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2={-1} k3={1} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
          />
          <feBlend in2="shape" result="effect1_innerShadow" />
        </filter>
        <linearGradient
          id="pen-slim-mask-grad"
          x1="5.625"
          y1="0"
          x2="5.625"
          y2="15.75"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D0CDCB" stopOpacity="0" />
          <stop offset="0.278846" stopColor="#D0CDCB" />
        </linearGradient>
        <linearGradient
          id="pen-slim-body-grad"
          x1="7.89091"
          y1="27.2601"
          x2="6.93068"
          y2="27.2601"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F0F0F0" />
          <stop offset="1" stopColor="#F8F8F8" />
        </linearGradient>
        <linearGradient
          id="pen-slim-shine-grad"
          x1="9.38755"
          y1="6.33165"
          x2="10.8421"
          y2="12.6828"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D8D8D8" />
          <stop offset="0.540027" stopColor="#DBDBDB" stopOpacity="0.2" />
          <stop offset="0.985392" stopColor="#DBDBDB" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient
          id="pen-slim-seam-grad"
          x1="7.625"
          y1="6.25"
          x2="7.625"
          y2="15.25"
          gradientUnits="userSpaceOnUse"
        >
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
  const height = (size * 24) / 16
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 16 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id="pen-marker-mask"
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
          fill="url(#pen-marker-mask-grad)"
        />
      </mask>
      <g mask="url(#pen-marker-mask)">
        <g filter="url(#pen-marker-drop)">
          <g filter="url(#pen-marker-cap-inner)">
            <path
              d="M10 4.55039C10 5.13029 9.5299 5.60039 8.95 5.60039L7.85 5.60039C7.2701 5.60039 6.8 5.13029 6.8 4.55039L6.8 3.35077C6.8 3.2617 6.8589 3.18337 6.94446 3.15863L9.74446 2.34926C9.87236 2.31229 10 2.40826 10 2.54139L10 4.55039Z"
              fill={ink}
            />
          </g>
          <path
            d="M10.5 4.55078C10.4998 5.40658 9.80602 6.10048 8.95019 6.10059L7.84961 6.10059C6.99388 6.10037 6.30002 5.40651 6.2998 4.55078L6.2998 3.35059C6.29988 3.03895 6.50628 2.76528 6.80566 2.67871L9.60547 1.86914C10.053 1.73978 10.4998 2.07524 10.5 2.54102L10.5 4.55078Z"
            stroke={ink}
          />
          <g filter="url(#pen-marker-body-inner)">
            <path
              d="M7.11697 4.81172C7.94506 4.79608 8.81644 4.79658 9.6442 4.81269C10.7523 4.83426 11.6703 5.65109 11.8669 6.7418L11.9128 6.99636C12.0809 7.92893 12.3461 8.84138 12.7039 9.71883L13.4219 11.4797C13.5393 11.7674 13.5996 12.0752 13.5996 12.3859L13.5996 42.4003C13.5996 43.7258 12.5251 44.8003 11.1996 44.8003L5.59961 44.8003C4.27413 44.8003 3.19961 43.7258 3.19961 42.4003L3.19962 12.3787C3.19962 12.0726 3.25816 11.7694 3.3721 11.4853L4.07746 9.72664C4.43146 8.84401 4.6919 7.92669 4.85453 6.98973L4.89561 6.75304C5.08586 5.65688 6.00463 4.83272 7.11697 4.81172Z"
              fill="url(#pen-marker-body-grad)"
            />
          </g>
          <path
            d="M13.0996 12.3862L13.0996 42.3999C13.0996 43.4492 12.2486 44.3003 11.1992 44.3003L5.5996 44.3003C4.55026 44.3003 3.69921 43.4492 3.69921 42.3999L3.69922 12.3784C3.69925 12.1362 3.74578 11.8962 3.83594 11.6714L4.54199 9.9126C4.90888 8.99778 5.17809 8.0468 5.34668 7.07568L5.38867 6.83838C5.53997 5.96729 6.26471 5.32849 7.12598 5.31201C7.94758 5.2965 8.81329 5.297 9.63477 5.31299C10.4938 5.32985 11.2187 5.96375 11.375 6.83057L11.4209 7.08545C11.5952 8.05217 11.8703 8.99813 12.2412 9.90771L12.959 11.6685C13.0519 11.8962 13.0996 12.1402 13.0996 12.3862Z"
            stroke="#18181B"
          />
          <path
            d="M8.7998 5.80029L9.84127 5.80029C10.3274 5.80029 10.7426 6.15035 10.829 6.62875C11.515 10.4238 11.6502 9.94277 12.5 12.0002C11.5381 11.1462 10.0216 11.491 9.52348 12.677L8.7998 14.4002L8.7998 5.80029Z"
            fill="url(#pen-marker-shine-grad)"
          />
          <rect
            x="12.4004"
            y="13"
            width="1"
            height="8"
            transform="rotate(90 12.4004 13)"
            fill="url(#pen-marker-seam-grad)"
          />
          <path
            d="M13.7256 42.4131L13.7129 42.6709C13.5836 43.9443 12.5076 44.9385 11.2002 44.9385H5.59375L5.34863 44.9258L5.34277 44.9248C4.15437 44.8042 3.20985 43.8602 3.08887 42.6719L3.08789 42.665L3.0752 42.4189V12.3848L3.08691 12.1562V12.1514H3.08789C3.10314 11.9921 3.13245 11.8338 3.17773 11.6797L3.17969 11.6738L3.25488 11.457L3.25684 11.4512L3.96191 9.69336C4.26862 8.92864 4.50488 8.13733 4.66699 7.33008L4.73242 6.97949L4.77344 6.74512C4.88742 6.08843 5.25133 5.5251 5.75977 5.15625C5.70634 4.96755 5.67582 4.76897 5.67578 4.56348V3.36328C5.6759 2.77336 6.06635 2.25475 6.63281 2.09082L9.43262 1.28125C10.2798 1.03637 11.1257 1.67194 11.126 2.55371V4.56348C11.1259 4.77794 11.0922 4.98468 11.0342 5.18066C11.524 5.54681 11.8761 6.09408 11.9912 6.73242L12.0371 6.9873C12.1828 7.7952 12.4017 8.58793 12.6914 9.35547L12.8203 9.68457L13.5391 11.4453C13.6316 11.6723 13.6892 11.9114 13.7129 12.1543L13.7139 12.1602L13.7256 12.3926V42.4131Z"
            stroke="black"
            strokeOpacity="0.54"
            strokeWidth="0.25"
          />
        </g>
        <rect
          x="4"
          y="13.6001"
          width="8.8"
          height="3.2"
          fill={ink}
        />
      </g>
      <defs>
        <filter
          id="pen-marker-drop"
          x="2.9502"
          y="1.10352"
          width="10.9004"
          height="47.96"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.01 0"
          />
          <feBlend in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend
            in="SourceGraphic"
            in2="effect1_dropShadow"
            result="shape"
          />
        </filter>
        <filter
          id="pen-marker-cap-inner"
          x="4.9998"
          y="1.34082"
          width="6.0002"
          height="5.25977"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="-3.2" />
          <feGaussianBlur stdDeviation="0.4" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2={-1} k3={1} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
          />
          <feBlend in2="shape" result="effect1_innerShadow" />
        </filter>
        <filter
          id="pen-marker-body-inner"
          x="3.19922"
          y="4.80029"
          width="10.4004"
          height="40"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="0.8" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2={-1} k3={1} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
          />
          <feBlend in2="shape" result="effect1_innerShadow" />
        </filter>
        <linearGradient
          id="pen-marker-mask-grad"
          x1="6"
          y1="0"
          x2="6"
          y2="16.8"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D0CDCB" stopOpacity="0" />
          <stop offset="0.278846" stopColor="#D0CDCB" />
        </linearGradient>
        <linearGradient
          id="pen-marker-body-grad"
          x1="8.68324"
          y1="28.011"
          x2="7.659"
          y2="28.011"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F0F0F0" />
          <stop offset="1" stopColor="#F8F8F8" />
        </linearGradient>
        <linearGradient
          id="pen-marker-shine-grad"
          x1="10.2799"
          y1="5.68743"
          x2="11.8314"
          y2="12.462"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D8D8D8" />
          <stop offset="0.540027" stopColor="#DBDBDB" stopOpacity="0.2" />
          <stop offset="0.985392" stopColor="#DBDBDB" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient
          id="pen-marker-seam-grad"
          x1="12.9004"
          y1="13"
          x2="12.9004"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
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
