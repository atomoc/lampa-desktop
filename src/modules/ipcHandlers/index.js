// modules/ipcHandlers/index.js
const { ipcMain } = require("electron");
const store = require("../storeManager");
const { getMainWindow } = require("../windowManager");
const { injectPlugin } = require("../pluginHandler");

const registerStoreHandlers = require("./storeHandlers");
// const registerProcessHandlers = require("./processHandlers");
const registerWindowHandlers = require("./windowHandlers");
const { registerSettingsHandlers } = require("./settingsHandlers");
const registerCloudHandlers = require("./cloudHandlers");
const registerTorrServerHandlers = require("./torrServerHandlers");
const registerFolderHandlers = require("./folderHandlers");

function registerIpcHandlers() {
  // ╨С╨░╨╖╨╛╨▓╤Л╨╡ ╨╛╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ store
  registerStoreHandlers(store);

  // ╨Ю╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ ╨┤╨╗╤П ╨┐╤А╨╛╤Ж╨╡╤Б╤Б╨╛╨▓ (spawn, fs) - ╤Г╨┤╨░╨╗╨╡╨╜╤Л ╨╕╨╖ ╤Б╨╛╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╨╣ ╨▒╨╡╨╖╨╛╨┐╨░╤Б╨╜╨╛╤Б╤В╨╕
  // registerProcessHandlers();

  // ╨Ю╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ ╨┤╨╗╤П ╤Г╨┐╤А╨░╨▓╨╗╨╡╨╜╨╕╤П ╨╛╨║╨╜╨╛╨╝
  registerWindowHandlers(getMainWindow);

  // ╨Ю╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ ╨┤╨╗╤П ╤Н╨║╤Б╨┐╨╛╤А╤В╨░/╨╕╨╝╨┐╨╛╤А╤В╨░ ╨╜╨░╤Б╤В╤А╨╛╨╡╨║
  registerSettingsHandlers(store, getMainWindow, injectPlugin);

  // ╨Ю╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ ╨┤╨╗╤П ╨╛╨▒╨╗╨░╤З╨╜╨╛╨│╨╛ ╤Н╨║╤Б╨┐╨╛╤А╤В╨░/╨╕╨╝╨┐╨╛╤А╤В╨░
  registerCloudHandlers(store, getMainWindow, injectPlugin);

  // ╨Ю╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ ╨┤╨╗╤П TorrServer
  registerTorrServerHandlers();

  // ╨Ю╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕ ╨┤╨╗╤П ╤А╨░╨▒╨╛╤В╤Л ╤Б ╨┐╨░╨┐╨║╨░╨╝╨╕
  registerFolderHandlers();

  // ╨Ф╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╡ ╨╛╨▒╤А╨░╨▒╨╛╤В╤З╨╕╨║╨╕
  ipcMain.handle("get-app-version", () => {
    const { app } = require("electron");
    return app.getVersion();
  });
}

module.exports = {
  registerIpcHandlers,
};
