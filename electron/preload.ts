import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openMedia: () => ipcRenderer.invoke('dialog:openMedia'),
  saveProject: (data: string) => ipcRenderer.invoke('dialog:saveProject', data),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  probeMedia: (path: string) => ipcRenderer.invoke('ffmpeg:probe', path),
  exportVideo: (options: unknown) => ipcRenderer.invoke('ffmpeg:export', options),
  readFileAsDataURL: (path: string) => ipcRenderer.invoke('fs:readFileAsDataURL', path),
  getTempDir: () => ipcRenderer.invoke('app:getTempDir'),
  showInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  onExportProgress: (cb: (progress: number) => void) => {
    ipcRenderer.on('export:progress', (_, p) => cb(p))
    return () => ipcRenderer.removeAllListeners('export:progress')
  },
})
