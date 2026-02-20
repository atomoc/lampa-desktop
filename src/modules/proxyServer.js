const http = require("http");
const httpProxy = require("http-proxy");
const audioTranscoder = require("./audioTranscoder");

class ProxyServerManager {
  constructor() {
    this.server = null;
    this.isClosed = false;
    this.closePromise = null;
  }

  setup() {
    const proxy = httpProxy.createProxyServer({
      target: "http://localhost:3999",
      changeOrigin: true,
      secure: false,
    });

    proxy.on("error", (err, req, res) => {
      if (!res.finished) {
        res.destroy();
      } else {
        res.socket?.destroy();
      }
    });

    const server = http.createServer((req, res) => {
      // Транскодирование AC3/EAC3 → AAC
      // Поддерживаем как /transcode?url=... так и /transcode/filename.mp4?url=...
      if (req.url.startsWith("/transcode")) {
        if (req.method === "OPTIONS") {
          res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
            "Content-Length": "0",
          });
          res.end();
          return;
        }

        try {
          audioTranscoder.handleRequest(req, res);
        } catch (err) {
          console.error("❌ [Proxy] Ошибка транскодера:", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("Transcoder error");
          }
        }
        return;
      }

      if (req.url.startsWith("/vlc")) {
        if (req.method === "OPTIONS") {
          res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Content-Length": "0",
          });
          res.end();
          return;
        }

        req.url = req.url.replace(/^\/vlc/, "") || "/";

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );

        proxy.web(req, res);
      } else {
        res.writeHead(404, {
          "Content-Type": "text/plain",
        });
        res.end("Not Found. Use /vlc or /transcode paths.");
      }
    });

    server.on("error", (err) => {
      console.error(`❌ [Proxy Server] Ошибка:`, err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Порт 4000 уже занят другим процессом! Транскодер не будет работать.`);
      }
    });

    try {
      this.server = server.listen(4000, "0.0.0.0", () => {
        console.log(`✅ Proxy server running on http://127.0.0.1:4000`);
        if (audioTranscoder.isAvailable()) {
          console.log(`✅ Audio transcoder (AC3→AAC) available on /transcode`);
        } else {
          console.warn(`⚠️ Audio transcoder unavailable — ffmpeg not found`);
        }
      });
    } catch (err) {
      console.error(`❌ [Proxy Server] Сбой при запуске listen:`, err);
    }

    return this.server;
  }

  close() {
    if (this.isClosed) {
      return Promise.resolve();
    }

    if (this.closePromise) {
      return this.closePromise;
    }

    if (!this.server) {
      this.isClosed = true;
      return Promise.resolve();
    }

    // Останавливаем все процессы ffmpeg
    audioTranscoder.stopAll();

    this.closePromise = new Promise((resolve) => {
      this.server.close(() => {
        console.log("✅ Proxy server closed");
        this.isClosed = true;
        this.server = null;
        this.closePromise = null;
        resolve();
      });
    });

    return this.closePromise;
  }

  isRunning() {
    return this.server !== null && !this.isClosed;
  }
}

const proxyManager = new ProxyServerManager();

module.exports = {
  setupProxyServer: () => proxyManager.setup(),
  closeProxyServer: () => proxyManager.close(),
  isProxyRunning: () => proxyManager.isRunning(),
};

