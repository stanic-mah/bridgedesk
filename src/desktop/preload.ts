import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bridgeDesk", {
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  getSystemChecks: (port: number) => ipcRenderer.invoke("system:checks", port),
  getUpdateStatus: () => ipcRenderer.invoke("update:status"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  chooseProject: () => ipcRenderer.invoke("dialog:chooseProject"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (input: unknown) => ipcRenderer.invoke("config:save", input),
  startTunnel: (input: unknown) => ipcRenderer.invoke("tunnel:start", input),
  cloudflareLogin: () => ipcRenderer.invoke("cloudflare:login"),
  createNamedTunnel: (input: unknown) => ipcRenderer.invoke("cloudflare:createTunnel", input),
  routeTunnelDns: (input: unknown) => ipcRenderer.invoke("cloudflare:routeDns", input),
  startServer: (input: unknown) => ipcRenderer.invoke("server:start", input),
  stopServer: () => ipcRenderer.invoke("server:stop"),
  stopAll: () => ipcRenderer.invoke("processes:stopAll"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  openExternal: (url: string) => ipcRenderer.invoke("external:open", url),
  onLog: (callback: (entry: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: unknown) => callback(entry);
    ipcRenderer.on("log", listener);
    return () => ipcRenderer.removeListener("log", listener);
  },
  onStateUpdate: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  },
  onUpdateStatus: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
});
