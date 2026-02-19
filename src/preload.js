const { contextBridge, ipcRenderer } = require("electron");

// Модуль для Node.js модулей удален из соображений безопасности (RCE)
// contextBridge.exposeInMainWorld("require", (module) => { ... });

// Основное Electron API
contextBridge.exposeInMainWorld("electronAPI", {
  // Управление приложением
  closeApp: () => ipcRenderer.send("close-app"),
  toogleFullscreen: () => ipcRenderer.send("toggle-fullscreen"),
  loadUrl: (url) => ipcRenderer.send("load-url", url),
  getAppVersion: async () => {
    return await ipcRenderer.invoke("get-app-version");
  },

  // Работа с хранилищем
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

  // Экспорт/импорт настроек
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

  // Торрент сервер
  torrServer: {
    // Управление процессом
    start: (args) => ipcRenderer.invoke("torrserver-start", args),
    stop: () => ipcRenderer.invoke("torrserver-stop"),
    restart: (args) => ipcRenderer.invoke("torrserver-restart", args),
    getStatus: () => ipcRenderer.invoke("torrserver-status"),

    // Установка и обновление
    download: (version) => ipcRenderer.invoke("torrserver-download", version),
    checkUpdate: () => ipcRenderer.invoke("torrserver-check-update"),
    update: () => ipcRenderer.invoke("torrserver-update"),

    // Подписка на вывод процесса (для отображения логов в интерфейсе)
    onOutput: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on("torrserver-output", subscription);

      // Подписываемся на вывод (инициируем отправку логов из main процесса)
      ipcRenderer.send("torrserver-subscribe-output");

      // Возвращаем функцию для отписки
      return () => {
        ipcRenderer.removeListener("torrserver-output", subscription);
      };
    },

    // Короткая форма для проверки статуса (удобно для кнопок)
    isRunning: async () => {
      const status = await ipcRenderer.invoke("torrserver-status");
      return status.running;
    },
    uninstall: (keepData = false) =>
      ipcRenderer.invoke("torrserver-uninstall", { keepData }),
    isInstalled: () => ipcRenderer.invoke("torrserver-is-installed"),
  },

  // Работа с папками
  folder: {
    open: (path) => ipcRenderer.invoke("folder-open", path),
  },
});

console.log("Preload script loaded successfully");
