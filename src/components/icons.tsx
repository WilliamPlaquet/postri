import type { ReactNode } from 'react'
import type { Tool } from '../lib/types'

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const ToolIcon = ({ tool }: { tool: Tool }) => {
  switch (tool) {
    case 'select':
      return (
        <Svg>
          <path d="M5 3.5l13 7.2-5.6 1.6L9.6 18 5 3.5z" />
        </Svg>
      )
    case 'hand':
      return (
        <Svg>
          <path d="M8 12V5.5a1.5 1.5 0 013 0V11m0-6.5V4a1.5 1.5 0 013 0v7m0-5.5a1.5 1.5 0 013 0V12m0-3.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-1.2a6 6 0 01-4.6-2.2L4.6 15a1.6 1.6 0 012.4-2L8 14" />
        </Svg>
      )
    case 'note':
      return (
        <Svg>
          <path d="M5 4h14v10l-6 6H5V4z" />
          <path d="M13 20v-6h6" />
        </Svg>
      )
    case 'text':
      return (
        <Svg>
          <path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" />
        </Svg>
      )
    case 'rect':
      return (
        <Svg>
          <rect x="4" y="6" width="16" height="12" rx="2.5" />
        </Svg>
      )
    case 'ellipse':
      return (
        <Svg>
          <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
        </Svg>
      )
    case 'diamond':
      return (
        <Svg>
          <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12 12 3.5z" />
        </Svg>
      )
    case 'arrow':
      return (
        <Svg>
          <path d="M5 19L19 5M10 5h9v9" />
        </Svg>
      )
    case 'draw':
      return (
        <Svg>
          <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
          <path d="M14.5 6.5l3 3" />
        </Svg>
      )
  }
}

export const Icon = {
  Undo: () => (
    <Svg>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </Svg>
  ),
  Redo: () => (
    <Svg>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
    </Svg>
  ),
  Plus: () => (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Minus: () => (
    <Svg>
      <path d="M5 12h14" />
    </Svg>
  ),
  Fit: () => (
    <Svg>
      <path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" />
    </Svg>
  ),
  Trash: () => (
    <Svg size={18}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" />
    </Svg>
  ),
  Copy: () => (
    <Svg size={18}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </Svg>
  ),
  Front: () => (
    <Svg size={18}>
      <rect x="9" y="9" width="11" height="11" rx="2" fill="currentColor" fillOpacity=".18" />
      <path d="M15 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1" />
    </Svg>
  ),
  Back: () => (
    <Svg size={18}>
      <rect x="3" y="3" width="11" height="11" rx="2" fill="currentColor" fillOpacity=".18" />
      <path d="M9 19v1a1 1 0 001 1h10a1 1 0 001-1V10a1 1 0 00-1-1h-1" />
    </Svg>
  ),
  Share: () => (
    <Svg size={18}>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </Svg>
  ),
  Home: () => (
    <Svg size={18}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  ),
  Menu: () => (
    <Svg size={18}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </Svg>
  ),
  Sun: () => (
    <Svg size={18}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Svg>
  ),
  Moon: () => (
    <Svg size={18}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
    </Svg>
  ),
  Help: () => (
    <Svg size={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01" />
    </Svg>
  ),
  Close: () => (
    <Svg size={18}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Check: () => (
    <Svg size={18}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  ),
  Dashed: () => (
    <Svg size={18}>
      <path d="M3 12h3M10.5 12h3M18 12h3" />
    </Svg>
  ),
  Solid: () => (
    <Svg size={18}>
      <path d="M3 12h18" />
    </Svg>
  ),
}
