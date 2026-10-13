import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openMedia: () => ipcRenderer.invoke('dialog:openMedia'),
  saveProject: (data: string) => ipcRenderer.invoke('dialog:saveProject', data),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  probeMedia: (path: string) => ipcRenderer.invoke('ffmpeg:probe', path),
  exportVideo: (options: unknown) => ipcRenderer.invoke('ffmpeg:export', options),
  onExportProgress: (cb: (progress: number) => void) => {
    ipcRenderer.on('export:progress', (_, p) => cb(p))
    return () => ipcRenderer.removeAllListeners('export:progress')
  },
})
