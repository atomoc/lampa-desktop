const { contextBridge, ipcRenderer } = require("electron");

// ╨Ь╨╛╨┤╤Г╨╗╤М ╨┤╨╗╤П Node.js ╨╝╨╛╨┤╤Г╨╗╨╡╨╣ ╤Г╨┤╨░╨╗╨╡╨╜ ╨╕╨╖ ╤Б╨╛╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╨╣ ╨▒╨╡╨╖╨╛╨┐╨░╤Б╨╜╨╛╤Б╤В╨╕ (RCE)
// contextBridge.exposeInMainWorld("require", (module) => { ... });

// ╨Ю╤Б╨╜╨╛╨▓╨╜╨╛╨╡ Electron API
contextBridge.exposeInMainWorld("electronAPI", {
  // ╨г╨┐╤А╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╨┐╤А╨╕╨╗╨╛╨╢╨╡╨╜╨╕╨╡╨╝
  closeApp: () => ipcRenderer.send("close-app"),
  toogleFullscreen: () => ipcRenderer.send("toggle-fullscreen"),
  openYoutube: () => ipcRenderer.send("open-youtube"),
  openTwitch: () => ipcRenderer.send("open-twitch"),
  loadUrl: (url) => ipcRenderer.send("load-url", url),
  getAppVersion: async () => {
    return await ipcRenderer.invoke("get-app-version");
  },

  // ╨а╨░╨▒╨╛╤В╨░ ╤Б ╤Е╤А╨░╨╜╨╕╨╗╨╕╤Й╨╡╨╝
  store: {
    get: async (key) => {
      return await ipcRenderer.invoke("store-get", key);
    },
    set: async (key, value) => {
      return await ipcRenderer.invoke("store-set", key, value);
    },
    has: async (key) => {
      return await ipcRenderer.invoke("store-has", key);
    },
    delete: async (key) => {
      return await ipcRenderer.invoke("store-delete", key);
    },
  },

  // ╨н╨║╤Б╨┐╨╛╤А╤В/╨╕╨╝╨┐╨╛╤А╤В ╨╜╨░╤Б╤В╤А╨╛╨╡╨║
  exportSettingsToCloud: async () => {
    return await ipcRenderer.invoke("export-settings-to-cloud");
  },
  importSettingsFromCloud: async (id, pin) => {
    return await ipcRenderer.invoke("import-settings-from-cloud", id, pin);
  },
  exportSettingsToFile: async () => {
    return await ipcRenderer.invoke("export-settings-to-file");
  },
  importSettingsFromFile: async () => {
    return await ipcRenderer.invoke("import-settings-from-file");
  },

  // ╨в╨╛╤А╤А╨╡╨╜╤В ╤Б╨╡╤А╨▓╨╡╤А
  torrServer: {
    // ╨г╨┐╤А╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╨┐╤А╨╛╤Ж╨╡╤Б╤Б╨╛╨╝
    start: (args) => ipcRenderer.invoke("torrserver-start", args),
    stop: () => ipcRenderer.invoke("torrserver-stop"),
    restart: (args) => ipcRenderer.invoke("torrserver-restart", args),
    getStatus: () => ipcRenderer.invoke("torrserver-status"),

    // ╨г╤Б╤В╨░╨╜╨╛╨▓╨║╨░ ╨╕ ╨╛╨▒╨╜╨╛╨▓╨╗╨╡╨╜╨╕╨╡
    download: (version) => ipcRenderer.invoke("torrserver-download", version),
    checkUpdate: () => ipcRenderer.invoke("torrserver-check-update"),
    update: () => ipcRenderer.invoke("torrserver-update"),

    // ╨Я╨╛╨┤╨┐╨╕╤Б╨║╨░ ╨╜╨░ ╨▓╤Л╨▓╨╛╨┤ ╨┐╤А╨╛╤Ж╨╡╤Б╤Б╨░ (╨┤╨╗╤П ╨╛╤В╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╤П ╨╗╨╛╨│╨╛╨▓ ╨▓ ╨╕╨╜╤В╨╡╤А╤Д╨╡╨╣╤Б╨╡)
    onOutput: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on("torrserver-output", subscription);

      // ╨Я╨╛╨┤╨┐╨╕╤Б╤Л╨▓╨░╨╡╨╝╤Б╤П ╨╜╨░ ╨▓╤Л╨▓╨╛╨┤ (╨╕╨╜╨╕╤Ж╨╕╨╕╤А╤Г╨╡╨╝ ╨╛╤В╨┐╤А╨░╨▓╨║╤Г ╨╗╨╛╨│╨╛╨▓ ╨╕╨╖ main ╨┐╤А╨╛╤Ж╨╡╤Б╤Б╨░)
      ipcRenderer.send("torrserver-subscribe-output");

      // ╨Т╨╛╨╖╨▓╤А╨░╤Й╨░╨╡╨╝ ╤Д╤Г╨╜╨║╤Ж╨╕╤О ╨┤╨╗╤П ╨╛╤В╨┐╨╕╤Б╨║╨╕
      return () => {
        ipcRenderer.removeListener("torrserver-output", subscription);
      };
    },

    // ╨Ъ╨╛╤А╨╛╤В╨║╨░╤П ╤Д╨╛╤А╨╝╨░ ╨┤╨╗╤П ╨┐╤А╨╛╨▓╨╡╤А╨║╨╕ ╤Б╤В╨░╤В╤Г╤Б╨░ (╤Г╨┤╨╛╨▒╨╜╨╛ ╨┤╨╗╤П ╨║╨╜╨╛╨┐╨╛╨║)
    isRunning: async () => {
      const status = await ipcRenderer.invoke("torrserver-status");
      return status.running;
    },
    uninstall: (keepData = false) =>
      ipcRenderer.invoke("torrserver-uninstall", { keepData }),
    isInstalled: () => ipcRenderer.invoke("torrserver-is-installed"),
  },

  // ╨а╨░╨▒╨╛╤В╨░ ╤Б ╨┐╨░╨┐╨║╨░╨╝╨╕
  folder: {
    open: (path) => ipcRenderer.invoke("folder-open", path),
  },
});

console.log("Preload script loaded successfully");
