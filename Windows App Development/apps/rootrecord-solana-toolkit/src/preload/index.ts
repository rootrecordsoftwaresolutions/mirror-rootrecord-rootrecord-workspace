import { contextBridge } from "electron";

/**
 * Add narrow IPC later if the main process should hold Pinata or paths.
 * Wallet signing stays in the renderer (Chromium) like the web app.
 */
contextBridge.exposeInMainWorld("rootrecord", {
  platform: process.platform,
});
