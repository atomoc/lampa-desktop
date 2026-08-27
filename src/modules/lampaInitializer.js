// modules/lampaInitializer.js
const os = require("os");
const vlcFinder = require("./vlcFinder");

class LampaInitializer {
  async initialize(mainWindow) {
    try {
      console.log("🔄 Инициализация Lampa...");

      // Базовая инициализация
      await this.initializeBasicSettings(mainWindow);

      // Инициализация AC3→AAC транскодирования
      await this.initializeAudioTranscoder(mainWindow);

      // Поиск и сохранение пути к VLC
      await this.initializeVLCPath(mainWindow);

      console.log("✅ Lampa инициализирована");
    } catch (error) {
      console.error("❌ Ошибка инициализации Lampa:", error);
    }
  }

  async initializeBasicSettings(mainWindow) {
    const deviceName = `Lampa ${os.hostname()}`;

    await mainWindow.webContents.executeJavaScript(`
      (function() {
        const app_init_defaults = {
          device_name: '${deviceName}',
          platform: 'electron',
          player_torrent: 'inner',
          poster_size: 'w500',
          torrserver_url: 'http://localhost:8090',
          torrserver_use_link: 'one'
        };

        Object.entries(app_init_defaults).forEach(([key, value]) => {
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, value);
          }
        });

        console.log('App', 'Базовые настройки применены');
      })();
    `);
  }

  /**
   * Инжектим перехватчик URL плеера для транскодирования AC3→AAC.
   *
   * Когда Lampa загружает видео от TorrServer (localhost:8090/stream/...),
   * мы перенаправляем URL через наш транскодирующий прокси:
   *   http://localhost:8090/stream/file.mkv?...&play
   *     → http://localhost:4000/transcode?url=http://localhost:8090/stream/file.mkv?...&play
   *
   * Прокси: видео copy + аудио AC3/EAC3/DTS → AAC
   */
  async initializeAudioTranscoder(mainWindow) {
    await mainWindow.webContents.executeJavaScript(`
      (function() {
        // Проверяем, поддерживается ли AC3 нативно
        var video = document.createElement('video');
        var ac3Supported = video.canPlayType('audio/mp4; codecs="ac-3"');
        var eac3Supported = video.canPlayType('audio/mp4; codecs="ec-3"');

        if (ac3Supported || eac3Supported) {
          console.log('🎬 [AudioTranscoder] AC3/EAC3 поддерживаются нативно, транскодирование не нужно');
          return;
        }

        console.log('🎬 [AudioTranscoder] AC3/EAC3 НЕ поддерживаются — активируем транскодирование');

        var TRANSCODE_PROXY = 'http://localhost:4000/transcode/video.mkv?url=';
        // Признак потока TorrServer — путь /stream/ вместе с параметром link=
        // (хеш раздачи). Хост и порт НЕ фиксируем: TorrServer может стоять где
        // угодно — localhost:8090, ts.example.com, за https-прокси и т.д.
        // Раньше здесь был белый список из двух localhost-адресов, и при
        // переезде TorrServer на отдельный хост звук AC3/EAC3 молча пропадал.
        function isTorrServerStream(url) {
          if (!url) return false;
          // Уже завёрнутое в транскодер второй раз не оборачиваем
          if (url.indexOf('/transcode') !== -1) return false;
          return url.indexOf('/stream/') !== -1 && url.indexOf('link=') !== -1;
        }

        // Подменяем duration
        var originalDuration = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');
        if (originalDuration && originalDuration.get) {
            Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
                get: function() {
                    if (this.src && this.src.indexOf('/transcode') !== -1 && this._transcodeDuration > 0) {
                        return this._transcodeDuration;
                    }
                    return originalDuration.get.call(this);
                },
                configurable: true,
                enumerable: true
            });
        }

        // ======= УМНАЯ ПЕРЕМОТКА 3.0 =======
        
        var origCT = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        if (origCT && origCT.get && origCT.set) {
            Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
                get: function() {
                    var browserTime = origCT.get.call(this);
                    // Если это транскодируемое видео и у нас есть офсет
                    if (this._transcodeOffset && this.src && this.src.indexOf('/transcode') !== -1) {
                        return browserTime + this._transcodeOffset;
                    }
                    return browserTime;
                },
                set: function(val) {
                    var video = this;
                    if (video.src && video.src.indexOf('/transcode') !== -1) {
                        // Если это НЕ наша внутренняя перезагрузка (т.е. это Lampa или Юзер тянет ползунок)
                        if (!video._reloadingWithSeek) {
                            var computedNow = (origCT.get.call(video) || 0) + (video._transcodeOffset || 0);
                            
                            // Если прыжок больше 2 секунд - это намеренный SEEK
                            if (Math.abs(val - computedNow) > 2) {
                                console.log('🎬 [Seek] Прыжок на', val.toFixed(1), 'сек');
                                video._transcodeOffset = val;
                                video._reloadingWithSeek = true;
                                
                                var baseUrl = video.src.split('&start=')[0];
                                video.src = baseUrl + '&start=' + val + '&v=' + Date.now();
                                video.load();
                                
                                video.addEventListener('canplay', function onReady() {
                                    video.removeEventListener('canplay', onReady);
                                    video._reloadingWithSeek = false;
                                    video.play().catch(function(){});
                                }, { once: true });
                                
                                // Страховка
                                setTimeout(function() { video._reloadingWithSeek = false; }, 10000);
                                return;
                            }
                        }
                        
                        // Если мы дошли сюда, значит это либо мелкая подстройка, либо браузер сам ставит 0
                        // В этом случае мы вычитаем офсет, чтобы попасть в "ноль" браузера
                        var offset = video._transcodeOffset || 0;
                        return origCT.set.call(video, Math.max(0, val - offset));
                    }
                    return origCT.set.call(video, val);
                },
                configurable: true,
                enumerable: true
            });
        }

        // При смене источника сбрасываем офсет
        var origSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
        if (origSrc && origSrc.set) {
            Object.defineProperty(HTMLMediaElement.prototype, 'src', {
                set: function(val) {
                    if (val && val.indexOf('/transcode') !== -1) {
                        if (val.indexOf('&start=') === -1) {
                            this._transcodeOffset = 0; // Сброс при новом видео
                        }
                    } else {
                        this._transcodeOffset = 0;
                    }
                    return origSrc.set.call(this, val);
                },
                get: origSrc.get,
                configurable: true
            });
        }

        function attachSeekingListener(video) {
            // Вся логика теперь в сеттере currentTime
        }

        function startDurationPoller(video, urlParam) {
            if (video._durationPoller) clearInterval(video._durationPoller);
            video._transcodeDuration = 0;
            var attempts = 0;
            video._durationPoller = setInterval(function() {
                attempts++;
                if (attempts > 30) {
                    clearInterval(video._durationPoller);
                    return;
                }
                fetch('http://localhost:4000/transcode/status?url=' + encodeURIComponent(urlParam))
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data && data.duration > 0) {
                            video._transcodeDuration = data.duration;
                            clearInterval(video._durationPoller);
                            video.dispatchEvent(new Event('durationchange'));
                            console.log('🎬 [AudioTranscoder] Получена длительность с сервера:', data.duration);
                        }
                    })
                    .catch(function(e) {});
            }, 2000);
        }

        // Оборачивает URL в транскодирующий прокси
        function wrapWithTranscoder(video, url) {
          try {
            if (!url) return url;
            // Не оборачиваем, если уже обёрнут
            if (url.indexOf('/transcode') !== -1) return url;
            // Оборачиваем только TorrServer потоки
            if (!isTorrServerStream(url)) return url;

            var wrapped = TRANSCODE_PROXY + encodeURIComponent(url);
            
            // Запускаем фоновый опрос длительности (запрос идет к прокси, а не к торренту)
            if (video && video.tagName === 'VIDEO') {
                startDurationPoller(video, url);
            }

            console.log('🎬 [AudioTranscoder] URL перенаправлен через транскодер');
            return wrapped;
          } catch (err) {
            console.error('🎬 [AudioTranscoder] Ошибка при оборачивании URL:', err);
            return url;
          }
        }


        // Перехватываем установку src на video элементах
        var originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');

        if (originalSrcDescriptor && originalSrcDescriptor.set) {
          Object.defineProperty(HTMLMediaElement.prototype, 'src', {
            get: originalSrcDescriptor.get,
            set: function(value) {
              if (isTorrServerStream(value)) {
                value = wrapWithTranscoder(this, value);
              }
              var res = originalSrcDescriptor.set.call(this, value);
              if (this.tagName === 'VIDEO') attachSeekingListener(this);
              return res;
            },
            configurable: true,
            enumerable: true
          });
        }

        // Также перехватываем setAttribute('src', ...)
        var originalSetAttribute = HTMLMediaElement.prototype.setAttribute;
        HTMLMediaElement.prototype.setAttribute = function(name, value) {
          if (name === 'src' && isTorrServerStream(value)) {
            value = wrapWithTranscoder(this, value);
          }
          var res = originalSetAttribute.call(this, name, value);
          if (this.tagName === 'VIDEO' && name === 'src') attachSeekingListener(this);
          return res;
        };

        // Подключаем к существующим
        document.querySelectorAll('video').forEach(attachSeekingListener);

        console.log('🎬 [AudioTranscoder] Перехват URL плеера и перемотки активирован');
        console.log('🎬 [AudioTranscoder] TorrServer потоки будут транскодироваться: AC3/EAC3/DTS → AAC');
      })();
    `);
  }


  async initializeVLCPath(mainWindow) {
    const existingPath = await vlcFinder.checkLocalStoragePath(mainWindow);

    if (existingPath && vlcFinder.validateVLC(existingPath)) {
      console.log(`✅ Путь к VLC уже есть: ${existingPath}`);
      return;
    }

    console.log("🔍 Автоматический поиск VLC...");
    const vlcPath = await vlcFinder.findVLC();

    if (vlcPath) {
      await vlcFinder.saveToLocalStorage(mainWindow, vlcPath);
    } else {
      await mainWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          if (window.Lampa?.Noty) {
            window.Lampa.Noty.show('VLC не найден. Видео может не работать. Установите VLC или другой плеер и укажите путь в настройках.', 15000);
          }
        }, 5000);
      `);
    }
  }
}

module.exports = new LampaInitializer();

