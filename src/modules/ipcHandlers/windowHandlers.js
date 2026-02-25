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

    const youtubeTvUserAgent = "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 NativeTV/5.0 TV Safari/538.1";
    ytWindow.loadURL("https://www.youtube.com/tv", { userAgent: youtubeTvUserAgent });

    ytWindow.webContents.on('did-finish-load', () => {
      ytWindow.webContents.executeJavaScript(`
        const icon_quit = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 4h3a2 2 0 0 1 2 2v1m-5 13h3a2 2 0 0 0 2-2v-1M4.425 19.428l6 1.8A2 2 0 0 0 13 19.312V4.688a2 2 0 0 0-2.575-1.916l-6 1.8A2 2 0 0 0 3 6.488v11.024a2 2 0 0 0 1.425 1.916M16.001 12h5m0 0l-2-2m2 2l-2 2"/></svg>';
        
        const btn = document.createElement('div');
        btn.id = 'lampa-yt-close-btn';
        btn.innerHTML = icon_quit;
        btn.tabIndex = 0; // Make it focusable
        btn.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;cursor:pointer;width:50px;height:50px;color:white;background:rgba(0,0,0,0.5);border-radius:50%;padding:12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;transition:all 0.3s;outline:none;';
        
        btn.onmouseover = () => { btn.style.background = 'rgba(255,0,0,0.8)'; btn.style.transform = 'scale(1.1)'; };
        btn.onmouseout = () => { btn.style.background = 'rgba(0,0,0,0.5)'; btn.style.transform = 'scale(1)'; };
        
        // CSS for focus state (when navigating via remote)
        const style = document.createElement('style');
        style.innerHTML = '#lampa-yt-close-btn:focus { background: rgba(255,0,0,1) !important; transform: scale(1.1); box-shadow: 0 0 15px rgba(255,0,0,0.8); border: 2px solid white; }';
        document.head.appendChild(style);
        
        btn.onclick = () => window.close();
        
        document.body.appendChild(btn);
        
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009 || e.keyCode === 461) { 
            // 10009/461 are typical TV "Return" / "Back" keycodes
            // We just let standard youtube handle back navigation, but if you want explicit close on 'Escape', we can leave it.
            // If they are on the root of youtube, hitting back might not close the TV app.
            if(e.altKey && e.key === 'q') window.close();
          }
          
          // Action on Enter when button is focused
          if (e.key === 'Enter' && document.activeElement === btn) {
            window.close();
          }
          
          // Allow remote navigation to the button
          if (e.key === 'ArrowUp') {
            // Check if we are at the top of the screen elements
            const active = document.activeElement;
            if (active) {
                const rect = active.getBoundingClientRect();
                if (rect.top < 150) { // If roughly at the top menu of YouTube
                   btn.focus();
                }
            }
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (document.activeElement === btn) {
               // When moving away from button, remove focus so YouTube takes over again
               btn.blur();
               // We could focus the first focusable element of YouTube here, but blur usually passes control back nicely
            }
          }
        });
      `);
    });
  });
}

module.exports = registerWindowHandlers;
