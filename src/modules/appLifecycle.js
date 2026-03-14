const { app } = require("electron");

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// ============================================================
// Chromium flags для поддержки кодеков и качественного видео
// Должны быть установлены ДО события "ready"
// ============================================================

// ВАЖНО: appendSwitch("enable-features") можно вызывать только ОДИН раз!
// Повторный вызов перезаписывает предыдущий, а не дополняет его.
// Все features должны быть в одном вызове через запятую.
app.commandLine.appendSwitch(
  "enable-features",
  [
    // AC3/EAC3 (Dolby Digital) — платформенные декодеры
    "PlatformHEVCDecoderSupport",
    "PlatformEncryptedDolbyVision",
    "MediaFoundationAsyncH264Encoding",
    // VP9/AV1 — ОБЯЗАТЕЛЬНО для YouTube HD/4K
    // YouTube раздаёт 1080p+ только в VP9 и AV1, H.264 ограничен 720p
    "VaapiVideoDecoder",
    "VaapiVideoEncoder",
  ].join(","),
);

// Аппаратное ускорение видео — критично для VP9/AV1 декодирования
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

// Отключаем GPU-ограничения которые могут мешать аппаратному декодированию
app.commandLine.appendSwitch("disable-gpu-driver-bug-workarounds");

console.log("🎬 Chromium flags для кодеков и аппаратного ускорения установлены");

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
