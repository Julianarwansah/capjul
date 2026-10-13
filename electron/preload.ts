import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type ElectronApi } from '../src/shared/ipc-contract'

// `satisfies ElectronApi` is the compile-time guarantee that the exposed object
// matches the contract both other sides derive their types from.
contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openMedia: () => ipcRenderer.invoke(IPC.dialogOpenMedia),
  saveProject: (project, path?) => ipcRenderer.invoke(IPC.projectSave, project, path),
  openProject: () => ipcRenderer.invoke(IPC.projectOpen),
  autosaveProject: (project) => ipcRenderer.invoke(IPC.projectAutosave, project),
  recoveryInfo: () => ipcRenderer.invoke(IPC.projectRecovery),
  restoreAutosave: () => ipcRenderer.invoke(IPC.projectRestore),
  probeMedia: (path: string) => ipcRenderer.invoke(IPC.mediaProbe, path),
  exportVideo: (request) => ipcRenderer.invoke(IPC.mediaExport, request),
  onExportProgress: (cb: (progress: number) => void) => {
    ipcRenderer.on(IPC.exportProgress, (_, p) => cb(p))
    return () => ipcRenderer.removeAllListeners(IPC.exportProgress)
  },
} satisfies ElectronApi)
