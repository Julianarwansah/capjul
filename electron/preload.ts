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
  exportVideo: (payload) => ipcRenderer.invoke(IPC.mediaExport, payload),
  exportVideoComposited: (payload) => ipcRenderer.invoke(IPC.mediaExportComposited, payload),
  sendExportFrame: (bytes: Uint8Array) => new Promise<void>((resolve, reject) => {
    const onAck = () => {
      ipcRenderer.removeListener(IPC.exportAbort, onAbort)
      resolve()
    }
    const onAbort = (_: unknown, message: string) => {
      ipcRenderer.removeListener(IPC.exportFrameAck, onAck)
      reject(new Error(message))
    }
    ipcRenderer.once(IPC.exportFrameAck, onAck)
    ipcRenderer.once(IPC.exportAbort, onAbort)
    ipcRenderer.send(IPC.exportFrame, bytes)
  }),
  endExportFrames: () => {
    ipcRenderer.send(IPC.exportFramesEnd)
  },
  onExportAbort: (cb: (message: string) => void) => {
    const listener = (_: unknown, message: string) => cb(message)
    ipcRenderer.on(IPC.exportAbort, listener)
    return () => ipcRenderer.removeListener(IPC.exportAbort, listener)
  },
  onExportProgress: (cb: (progress: number) => void) => {
    ipcRenderer.on(IPC.exportProgress, (_, p) => cb(p))
    return () => ipcRenderer.removeAllListeners(IPC.exportProgress)
  },
} satisfies ElectronApi)
