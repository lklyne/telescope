import { createContext, useState } from 'react'

// Renderer-local hover state for entities (avoids IPC round-trip through main process).
// Split into two contexts so entity shells (which only write) don't re-render when the
// hovered ID changes — only the outline layer (which reads) re-renders.
export const EntityHoverValueContext = createContext<string | null>(null)
export const EntityHoverSetterContext = createContext<(id: string | null) => void>(() => {})

export function EntityHoverProvider({ children }: { children: React.ReactNode }) {
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null)
  return (
    <EntityHoverSetterContext.Provider value={setHoveredEntityId}>
      <EntityHoverValueContext.Provider value={hoveredEntityId}>
        {children}
      </EntityHoverValueContext.Provider>
    </EntityHoverSetterContext.Provider>
  )
}
