/**
 * Модуль транскодирования аудио AC3/EAC3/DTS → AAC
 *
 * Версия 3.0: Оптимизирована для мгновенной перемотки.
 * Потоки всегда начинаются с PTS 0 для мгновенного старта в браузере.
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

let ffmpegPath;
try {
    ffmpegPath = require("ffmpeg-static");
    if (ffmpegPath && ffmpegPath.includes("app.asar")) {
        ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
    }
    console.log(`🎬 FFmpeg найден: ${ffmpegPath}`);
} catch (e) {
    console.error("❌ ffmpeg-static не установлен:", e.message);
}

class AudioTranscoder {
    constructor() {
        this.activeProcesses = new Map();
        this.streamDurations = new Map();
    }

    handleRequest(req, res) {
        if (!ffmpegPath) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("FFmpeg not available");
            return;
        }

        const url = new URL(req.url, "http://localhost");
        const pathname = url.pathname;
        const targetUrlParam = url.searchParams.get("url");

        // Обработка статуса (длительности)
        if (pathname === '/transcode/status') {
            const debugMsg = url.searchParams.get("debug");
            if (debugMsg) {
                console.log(`🔍 [DEBUG] ${debugMsg}`);
                res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
                res.end('{"ok":true}');
                return;
            }
            let duration = this.streamDurations.get(targetUrlParam);
            if (!duration && this.streamDurations.size > 0) {
                duration = Array.from(this.streamDurations.values()).pop();
            }
            res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ duration: duration || 0 }));
            return;
        }

        const targetUrl = url.searchParams.get("url");
        const startParam = url.searchParams.get("start") || "0";

        if (!targetUrl) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Missing url parameter");
            return;
        }

        // КРИТИЧНО: Убиваем старые процессы (освобождаем TorrServer)
        this.stopAll();

        const seekTime = parseFloat(startParam);
        console.log(`🎬 [Transcode] ${seekTime > 0 ? 'Seek to ' + seekTime + 's' : 'Start'}: ${targetUrl}`);

        // Статический ffmpeg не может разрезолвить "localhost" — заменяем на IP
        const ffmpegTargetUrl = targetUrl.replace(/localhost/g, '127.0.0.1');

        const ffmpegArgs = [
            "-hide_banner",
            "-probesize", "10M",
            "-analyzeduration", "10M",
            "-fflags", "+genpts+discardcorrupt",
            "-reconnect", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5"
        ];

        if (seekTime > 0) {
            // Быстрый поиск во входящем потоке
            ffmpegArgs.push("-ss", seekTime.toString());
        }

        ffmpegArgs.push(
            "-i", ffmpegTargetUrl,
            "-y",
            "-map", "0:v:0",
            "-map", "0:a:0", // Берем первую аудиодорожку
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ac", "2",
            "-async", "1",
            "-avoid_negative_ts", "make_zero", // Сбрасываем PTS в 0! Мгновенный старт!
            "-sn", "-dn",
            "-max_muxing_queue_size", "9999",
            "-f", "matroska",
            "pipe:1"
        );

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
            stdio: ["ignore", "pipe", "pipe"],
        });

        const requestId = Date.now().toString();
        this.activeProcesses.set(requestId, { proc: ffmpegProcess });

        res.writeHead(200, {
            "Content-Type": "video/x-matroska",
            "Access-Control-Allow-Origin": "*",
            "Connection": "keep-alive"
        });

        ffmpegProcess.stdout.pipe(res);

        let stderrLog = "";
        let durationParsed = false;
        ffmpegProcess.stderr.on("data", (data) => {
            const str = data.toString();
            console.log(`🎬 [FFmpeg stderr] ${str.trim()}`);
            stderrLog += str;
            if (!durationParsed) {
                const durationMatch = stderrLog.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (durationMatch) {
                    const hours = parseInt(durationMatch[1], 10);
                    const minutes = parseInt(durationMatch[2], 10);
                    const seconds = parseFloat(durationMatch[3]);
                    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
                    this.streamDurations.set(targetUrl, totalSeconds);
                    durationParsed = true;
                }
            }
        });

        const cleanup = () => {
            if (ffmpegProcess && !ffmpegProcess.killed) {
                ffmpegProcess.kill("SIGKILL");
            }
            this.activeProcesses.delete(requestId);
        };

        ffmpegProcess.on("exit", cleanup);
        req.on("close", cleanup);
        res.on("close", cleanup);
    }

    stopAll() {
        for (const [id, data] of this.activeProcesses) {
            if (!data.proc.killed) data.proc.kill("SIGKILL");
        }
        this.activeProcesses.clear();
    }

    isAvailable() { return !!ffmpegPath; }
}

module.exports = new AudioTranscoder();
