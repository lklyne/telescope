export interface DesignSystemManifest {
  name: string
  version?: string
  source: string
  components: Record<string, DSComponentDef>
  tokens: Record<string, DSTokenDef>
}

export interface DSComponentDef {
  displayName: string
  fiberNames: string[]
  selectors: string[]
  tokens: string[]
  propSignature: DSPropDef[]
  variants: Record<string, string>
}

export interface DSPropDef {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum'
  values?: string[]
  defaultValue?: string
  tokenMapping?: string
}

export interface DSTokenDef {
  name: string
  category:
    | 'color'
    | 'spacing'
    | 'typography'
    | 'radius'
    | 'shadow'
    | 'other'
  value?: string
  figmaRef?: string
}
