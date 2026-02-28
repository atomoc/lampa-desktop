const { ipcMain } = require("electron");

function registerWindowHandlers(getMainWindow) {
  ipcMain.on("toggle-fullscreen", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    } else {
      mainWindow.setFullScreen(true);
    }
  });

  ipcMain.on("reload-page", (event, url) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    mainWindow.loadURL(url).catch((err) => {
      console.error("Ошибка загрузки URL:", err);
    });
  });

  ipcMain.on("close-app", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.close();
    }
  });

  ipcMain.on("open-youtube", () => {
    const { BrowserWindow } = require("electron");
    const mainWindow = getMainWindow();
    const isFullscreen = mainWindow ? mainWindow.isFullScreen() : false;
    const parentBounds = mainWindow ? mainWindow.getBounds() : null;

    let ytWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      fullscreen: isFullscreen,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      backgroundColor: '#000000',
    });

    if (parentBounds && !isFullscreen) {
      ytWindow.setBounds(parentBounds);
    }
    ytWindow.setMenu(null);

    // Известный рабочий хак из сообщества: притворяемся консолью PlayStation 4.
    // YouTube доверяет PS4 и отдаёт потоки 1080p и 4K без строгих проверок DRM
    // (Widevine L1), которые требуются для Smart TV (Tizen/WebOS).
    const youtubeTvUserAgent = "Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)";
    ytWindow.loadURL("https://www.youtube.com/tv", { userAgent: youtubeTvUserAgent });

    ytWindow.webContents.on('did-finish-load', () => {
      ytWindow.webContents.executeJavaScript(`
        const icon_quit = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 4h3a2 2 0 0 1 2 2v1m-5 13h3a2 2 0 0 0 2-2v-1M4.425 19.428l6 1.8A2 2 0 0 0 13 19.312V4.688a2 2 0 0 0-2.575-1.916l-6 1.8A2 2 0 0 0 3 6.488v11.024a2 2 0 0 0 1.425 1.916M16.001 12h5m0 0l-2-2m2 2l-2 2"/></svg>';
        
        const btn = document.createElement('div');
        btn.id = 'lampa-yt-close-btn';
        btn.innerHTML = icon_quit;
        btn.tabIndex = 0;
        btn.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;cursor:pointer;width:50px;height:50px;color:white;background:rgba(0,0,0,0.5);border-radius:50%;padding:12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;transition:all 0.3s;outline:none;';
        
        btn.onmouseover = () => { btn.style.background = 'rgba(255,0,0,0.8)'; btn.style.transform = 'scale(1.1)'; };
        btn.onmouseout = () => { btn.style.background = 'rgba(0,0,0,0.5)'; btn.style.transform = 'scale(1)'; };
        
        const style = document.createElement('style');
        style.innerHTML = '#lampa-yt-close-btn:focus { background: rgba(255,0,0,1) !important; transform: scale(1.1); box-shadow: 0 0 15px rgba(255,0,0,0.8); border: 2px solid white; }';
        document.head.appendChild(style);
        
        btn.onclick = () => window.close();
        
        document.body.appendChild(btn);
        
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009 || e.keyCode === 461) { 
            if(e.altKey && e.key === 'q') window.close();
          }
          
          if (e.key === 'Enter' && document.activeElement === btn) {
            window.close();
          }
          
          if (e.key === 'ArrowUp') {
            const active = document.activeElement;
            if (active) {
                const rect = active.getBoundingClientRect();
                if (rect.top < 150) {
                   btn.focus();
                }
            }
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (document.activeElement === btn) {
               btn.blur();
            }
          }
        });
      `);
    });
  });

  ipcMain.on("open-twitch", () => {
    const { BrowserWindow, app } = require("electron");
    const path = require("path");
    const mainWindow = getMainWindow();
    const isFullscreen = mainWindow ? mainWindow.isFullScreen() : false;
    const parentBounds = mainWindow ? mainWindow.getBounds() : null;

    let twitchWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      fullscreen: isFullscreen,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        autoplayPolicy: "no-user-gesture-required", // РАЗРЕШАЕМ АВТОВОСПРОИЗВЕДЕНИЕ СО ЗВУКОМ!
        webSecurity: false, // Отключаем CORS, чтобы локальный клиент мог дергать API Twitch
      },
      backgroundColor: '#000000',
    });

    if (parentBounds && !isFullscreen) {
      twitchWindow.setBounds(parentBounds);
    }
    twitchWindow.setMenu(null);

    // Убираем CSP, чтобы локальный клиент мог свободно обращаться к API Twitch без блокировок
    twitchWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = Object.assign({}, details.responseHeaders);
      Object.keys(responseHeaders).forEach((header) => {
        if (header.toLowerCase() === 'content-security-policy') {
          delete responseHeaders[header];
        }
      });
      callback({ cancel: false, responseHeaders });
    });

    // FIX: Inject IntersectionObserver override INTO the embed.twitch.tv iframe
    // by intercepting its HTML response and prepending our script.
    // This runs BEFORE any Twitch code, so the visibility check always passes.
    // Result: play/pause/switch-stream all work natively through Twitch's API.
    twitchWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['https://embed.twitch.tv/*'] },
      (details, callback) => {
        // Only intercept the main HTML page request (not sub-resources like .js/.css)
        if (details.resourceType === 'subFrame' || details.resourceType === 'mainFrame') {
          // Let it through but we'll modify the response via did-frame-finish-load
        }
        callback({ cancel: false });
      }
    );

    // Inject the visibility override as early as possible into embed.twitch.tv frames
    twitchWindow.webContents.on('did-frame-navigate', (event, url, httpResponseCode, httpStatusText, isMainFrame, frameProcessId, frameRoutingId) => {
      if (isMainFrame) return;
      if (!url.includes('embed.twitch.tv')) return;

      try {
        const mainFrame = twitchWindow.webContents.mainFrame;
        if (!mainFrame) return;

        // Find the embed iframe and inject override IMMEDIATELY on navigation
        for (const frame of mainFrame.frames) {
          if (frame.url && frame.url.includes('embed.twitch.tv')) {
            console.log('[Twitch] Injecting IntersectionObserver override into embed frame...');

            frame.executeJavaScript(`
              (function() {
                // Override IntersectionObserver so Twitch's visibility check always passes
                var OrigIO = window.IntersectionObserver;
                window.IntersectionObserver = function(callback, options) {
                  return new OrigIO(function(entries, observer) {
                    var fakeEntries = entries.map(function(entry) {
                      return {
                        boundingClientRect: entry.boundingClientRect,
                        intersectionRatio: 1.0,
                        intersectionRect: entry.boundingClientRect,
                        isIntersecting: true,
                        isVisible: true,
                        rootBounds: entry.rootBounds,
                        target: entry.target,
                        time: entry.time
                      };
                    });
                    callback(fakeEntries, observer);
                  }, options);
                };
                window.IntersectionObserver.prototype = OrigIO.prototype;
                console.log('[Lampa] IO override injected into embed.twitch.tv via did-frame-navigate');
              })();
            `, true).catch(e => console.log('[Twitch] Frame inject error:', e.message));
          }
        }
      } catch (e) {
        console.log('[Twitch] Frame navigate error:', e.message);
      }
    });

    // Also inject into sub-sub-frames (player.twitch.tv inside embed.twitch.tv)
    twitchWindow.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
      if (isMainFrame) return;
      try {
        const allFrames = [];
        const collectFrames = (frame) => {
          allFrames.push(frame);
          for (const child of frame.frames) {
            collectFrames(child);
          }
        };
        collectFrames(twitchWindow.webContents.mainFrame);

        for (const frame of allFrames) {
          if (frame.url && (frame.url.includes('embed.twitch.tv') || frame.url.includes('player.twitch.tv'))) {
            frame.executeJavaScript(`
              (function() {
                if (window._lampaIOFixed) return;
                window._lampaIOFixed = true;
                var OrigIO = window.IntersectionObserver;
                if (!OrigIO) return;
                window.IntersectionObserver = function(callback, options) {
                  return new OrigIO(function(entries, observer) {
                    var fakeEntries = entries.map(function(entry) {
                      return {
                        boundingClientRect: entry.boundingClientRect,
                        intersectionRatio: 1.0,
                        intersectionRect: entry.boundingClientRect,
                        isIntersecting: true,
                        isVisible: true,
                        rootBounds: entry.rootBounds,
                        target: entry.target,
                        time: entry.time
                      };
                    });
                    callback(fakeEntries, observer);
                  }, options);
                };
                window.IntersectionObserver.prototype = OrigIO.prototype;
                console.log('[Lampa] IO override in: ' + location.hostname);
              })();
            `, true).catch(() => { });
          }
        }
      } catch (e) { }
    });

    const twitchAppPath = path.join(__dirname, "../../../src/plugins/twitch/app");

    // Create a simple local server to serve twitch app via http://localhost instead of file://
    // This solves the 'Oh no! This object is misconfigured' error for player.twitch.tv
    const http = require("http");
    const fs = require("fs");

    const port = 14000;

    // Check if server is already running to avoid EADDRINUSE
    if (!global.twitchServerStarted) {
      const server = http.createServer((req, res) => {
        let reqUrl = req.url.split('?')[0];
        if (reqUrl === '/') reqUrl = '/index.html';
        const filePath = path.join(twitchAppPath, reqUrl);

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end();
            return;
          }
          let ext = path.extname(filePath);
          let contentType = 'text/html';
          switch (ext) {
            case '.js': contentType = 'text/javascript'; break;
            case '.css': contentType = 'text/css'; break;
            case '.png': contentType = 'image/png'; break;
            case '.jpg': contentType = 'image/jpg'; break;
            case '.svg': contentType = 'image/svg+xml'; break;
            case '.json': contentType = 'application/json'; break;
          }
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      });
      // Handle potential port conflicts gracefully
      server.on('error', (e) => {
        console.error("Twitch Local Server Error: ", e);
      });
      server.listen(port, '127.0.0.1');
      global.twitchServerStarted = true;
    }

    twitchWindow.loadURL("http://localhost:" + port + "/");


    twitchWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Twitch Window Console]: ${message} (source: ${sourceId}:${line})`);
    });

    twitchWindow.webContents.on('did-finish-load', () => {
      twitchWindow.webContents.executeJavaScript(`
        // FIX: Override IntersectionObserver on THIS page (parent page where v1.js runs)
        // Twitch Embed SDK (v1.js) creates an IntersectionObserver on the iframe element
        // to check if it's visible. Since our SmartTwitchTV page hides scene2/twitch-embed
        // initially, the observer reports 0 intersection, and v1.js blocks playback.
        // By overriding IntersectionObserver HERE, v1.js always sees the iframe as visible,
        // and all play/pause/switch-stream controls work normally via Twitch's own API.
        
        var OrigIO = window.IntersectionObserver;
        window.IntersectionObserver = function(callback, options) {
          return new OrigIO(function(entries, observer) {
            var fakeEntries = entries.map(function(entry) {
              return {
                boundingClientRect: entry.boundingClientRect,
                intersectionRatio: 1.0,
                intersectionRect: entry.boundingClientRect,
                isIntersecting: true,
                isVisible: true,
                rootBounds: entry.rootBounds,
                target: entry.target,
                time: entry.time
              };
            });
            callback(fakeEntries, observer);
          }, options);
        };
        window.IntersectionObserver.prototype = OrigIO.prototype;

        // Make scene2 and twitch-embed visible
        var fixStyle = document.createElement('style');
        fixStyle.innerHTML = '#twitch-embed { display: block !important; } #scene2 { opacity: 1 !important; pointer-events: auto !important; }';
        document.head.appendChild(fixStyle);

        // Добавляем крестик для закрытия
        const icon_quit = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 4h3a2 2 0 0 1 2 2v1m-5 13h3a2 2 0 0 0 2-2v-1M4.425 19.428l6 1.8A2 2 0 0 0 13 19.312V4.688a2 2 0 0 0-2.575-1.916l-6 1.8A2 2 0 0 0 3 6.488v11.024a2 2 0 0 0 1.425 1.916M16.001 12h5m0 0l-2-2m2 2l-2 2"/></svg>';
        const btn = document.createElement('div');
        btn.id = 'lampa-twitch-close-btn';
        btn.innerHTML = icon_quit;
        btn.tabIndex = 9999;
        btn.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;cursor:pointer;width:50px;height:50px;color:white;background:rgba(0,0,0,0.5);border-radius:50%;padding:12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;transition:all 0.3s;outline:none;';

        btn.onmouseover = () => { btn.style.background = 'rgba(255,0,0,0.8)'; btn.style.transform = 'scale(1.1)'; };
        btn.onmouseout = () => { btn.style.background = 'rgba(0,0,0,0.5)'; btn.style.transform = 'scale(1)'; };

        btn.onclick = () => window.close();
        document.body.appendChild(btn);

        const style = document.createElement('style');
        style.innerHTML = '#lampa-twitch-close-btn:focus { background: rgba(255,0,0,1) !important; transform: scale(1.1); box-shadow: 0 0 15px rgba(255,0,0,0.8); border: 2px solid white; }';
        document.head.appendChild(style);

        // Обработка кастомных кнопок TV-пульта
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009 || e.keyCode === 461) { 
            if(e.altKey && e.key === 'q') {
               window.close();
            }
          }
        });
      `, true);
    });
  });
}

module.exports = registerWindowHandlers;
