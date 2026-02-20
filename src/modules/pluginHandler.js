const { readFileSync } = require("fs");
const path = require("node:path");
const lampaInitializer = require("./lampaInitializer");

function setupPluginHandler(mainWindow) {
  mainWindow.webContents.on("did-finish-load", async () => {
    try {
      await waitForLampaReady(mainWindow);

      // Инжектим диагностику медиа-ошибок
      await injectMediaDiagnostics(mainWindow);

      await lampaInitializer.initialize(mainWindow);
      injectPlugin(mainWindow);
    } catch (err) {
      console.error("Ошибка при перезагрузке:", err);
    }
  });
}

async function waitForLampaReady(mainWindow) {
  return new Promise((resolve) => {
    const check = async () => {
      const isReady = await mainWindow.webContents
        .executeJavaScript("window.Lampa !== undefined", true)
        .catch(() => false);

      if (isReady) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function injectPlugin(mainWindow) {
  const pluginCode = readFileSync(
    path.join(__dirname, "..", "plugin.js"),
    "utf-8",
  );
  mainWindow.webContents
    .executeJavaScript(pluginCode)
    .then(() => {
      console.log("Плагин успешно внедрён");
    })
    .catch((err) => {
      console.error("Ошибка внедрения плагина:", err);
    });
}

/**
 * Инжектим диагностику медиа-ошибок для отладки AC3/EAC3 проблем
 */
async function injectMediaDiagnostics(mainWindow) {
  await mainWindow.webContents.executeJavaScript(`
    (function() {
      // Проверяем поддержку кодеков
      const codecs = [
        'audio/mp4; codecs="ac-3"',
        'audio/mp4; codecs="ec-3"',
        'audio/mp4; codecs="mp4a.40.2"',
        'video/mp4; codecs="avc1.42E01E"',
        'video/mp4; codecs="avc1.42E01E, ac-3"',
        'video/mp4; codecs="avc1.42E01E, ec-3"',
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/webm; codecs="vp8"',
        'video/webm; codecs="vp9"',
        'audio/ogg; codecs="vorbis"'
      ];

      console.log('🎬 [Диагностика кодеков]');
      const video = document.createElement('video');
      codecs.forEach(codec => {
        const result = video.canPlayType(codec);
        const icon = result ? '✅' : '❌';
        console.log(icon + ' ' + codec + ': ' + (result || 'НЕ ПОДДЕРЖИВАЕТСЯ'));
      });

      // Перехватываем ошибки медиа-элементов
      const MEDIA_ERRORS = {
        1: 'MEDIA_ERR_ABORTED — воспроизведение прервано',
        2: 'MEDIA_ERR_NETWORK — сетевая ошибка при загрузке',
        3: 'MEDIA_ERR_DECODE — ошибка декодирования (возможно неподдерживаемый кодек AC3/EAC3)',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED — формат не поддерживается'
      };

      function attachMediaListener(el) {
        if (el._diagAttached) return;
        el._diagAttached = true;

        el.addEventListener('error', function(e) {
          const err = el.error;
          if (err) {
            console.error('🔴 [Медиа ошибка]', MEDIA_ERRORS[err.code] || 'Неизвестная ошибка', {
              code: err.code,
              message: err.message,
              src: el.src || el.currentSrc,
              tagName: el.tagName
            });
          }
        });

        el.addEventListener('loadstart', function() {
          console.log('🔄 [Медиа] Начало загрузки:', el.src || el.currentSrc);
        });

        el.addEventListener('canplay', function() {
          console.log('✅ [Медиа] Готов к воспроизведению:', el.src || el.currentSrc);
        });

        el.addEventListener('stalled', function() {
          console.warn('⚠️ [Медиа] Загрузка застопорилась (stalled)');
        });

        el.addEventListener('waiting', function() {
          console.warn('⏳ [Медиа] Ожидание данных (waiting/buffering)');
        });
      }

      // Подключаем диагностику к существующим элементам
      document.querySelectorAll('video, audio').forEach(attachMediaListener);

      // Подключаем MutationObserver для новых элементов
      const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
              attachMediaListener(node);
            }
            if (node.querySelectorAll) {
              node.querySelectorAll('video, audio').forEach(attachMediaListener);
            }
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
      console.log('🎬 [Диагностика медиа] Активирована — следим за ошибками video/audio');
    })();
  `);
}

module.exports = {
  setupPluginHandler,
  injectPlugin,
};
