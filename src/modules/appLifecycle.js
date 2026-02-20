const { app } = require("electron");

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// ============================================================
// Chromium flags для поддержки проприетарных кодеков AC3/EAC3
// Должны быть установлены ДО события "ready"
// ============================================================

// Включаем платформенные декодеры AC3/EAC3 (Windows Media Foundation / macOS AudioToolbox)
app.commandLine.appendSwitch(
  "enable-features",
  "PlatformHEVCDecoderSupport,PlatformEncryptedDolbyVision",
);

// Отключаем GPU-ограничения которые могут мешать аппаратному декодированию
app.commandLine.appendSwitch("disable-gpu-driver-bug-workarounds");

// Разрешаем проприетарные кодеки (H.264, AAC, AC3 и т.д.)
app.commandLine.appendSwitch("enable-features", "MediaFoundationAsyncH264Encoding");

console.log("🎬 Chromium flags для AC3/EAC3 установлены");

function setupAppLifecycle() {
  app.on("second-instance", () => {
    const { getMainWindow } = require("./windowManager");
    const mainWindow = getMainWindow();

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

module.exports = {
  setupAppLifecycle,
  gotTheLock,
};
