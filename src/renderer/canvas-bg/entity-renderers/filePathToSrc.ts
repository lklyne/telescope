export function filePathToSrc(filePath: string): string {
  if (
    filePath.startsWith('local-file://') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://')
  ) {
    return filePath
  }
  return `local-file://${filePath}`
}

export interface RendererFileApi {
  showFileInFinder: (path: string) => void
  readNoteFile: (path: string) => Promise<string | null>
  writeNoteFile: (path: string, content: string) => Promise<boolean>
  renameNoteFile: (path: string, newName: string) => Promise<string | null>
}

export function getFileApi(): RendererFileApi {
  return (window as unknown as { electronAPI: RendererFileApi }).electronAPI
}
