/**
 * electron-builder afterPack хук
 *
 * Заменяет ffmpeg в собранном приложении на версию с AC3/EAC3 кодеками.
 * Этот скрипт вызывается electron-builder после упаковки приложения,
 * но до создания инсталлятора.
 *
 * electron-builder передаёт context с информацией о платформе,
 * архитектуре и путям к файлам.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const NWJS_FFMPEG_VERSION = "0.107.0";
const GITHUB_RELEASES_BASE = `https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/${NWJS_FFMPEG_VERSION}`;

// Маппинг для electron-builder
const CONFIG = {
    win32: {
        x64: `${NWJS_FFMPEG_VERSION}-win-x64.zip`,
        ia32: `${NWJS_FFMPEG_VERSION}-win-ia32.zip`,
        arm64: `${NWJS_FFMPEG_VERSION}-win-arm64.zip`,
        filename: "ffmpeg.dll",
    },
    linux: {
        x64: `${NWJS_FFMPEG_VERSION}-linux-x64.zip`,
        ia32: `${NWJS_FFMPEG_VERSION}-linux-ia32.zip`,
        filename: "libffmpeg.so",
    },
    darwin: {
        x64: `${NWJS_FFMPEG_VERSION}-osx-x64.zip`,
        arm64: `${NWJS_FFMPEG_VERSION}-osx-arm64.zip`,
        filename: "libffmpeg.dylib",
    },
};

function downloadFile(url, destPath, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error("Too many redirects"));

        const protocol = url.startsWith("https") ? https : http;
        protocol
            .get(url, { headers: { "User-Agent": "lampa-desktop" } }, (res) => {
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    return resolve(
                        downloadFile(res.headers.location, destPath, maxRedirects - 1),
                    );
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }

                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on("finish", () => {
                    file.close();
                    resolve();
                });
                file.on("error", reject);
            })
            .on("error", reject);
    });
}

async function extractZip(zipPath, destDir) {
    const { execSync } = require("child_process");
    fs.mkdirSync(destDir, { recursive: true });

    if (process.platform === "win32") {
        execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
            { stdio: "pipe" },
        );
    } else {
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "pipe" });
    }
}

/**
 * Находит ffmpeg в директории собранного приложения
 */
function findFfmpegInAppDir(appDir, platform) {
    const filename = CONFIG[platform]?.filename;
    if (!filename) return null;

    // Рекурсивный поиск файла
    function findFile(dir, name) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === name) {
                return fullPath;
            }
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
                const found = findFile(fullPath, name);
                if (found) return found;
            }
        }
        return null;
    }

    return findFile(appDir, filename);
}

/**
 * Основная функция — вызывается electron-builder
 */
module.exports = async function afterPack(context) {
    // electron-builder context содержит:
    //   context.appOutDir — директория с собранным приложением
    //   context.electronPlatformName — 'win32', 'linux', 'darwin'
    //   context.arch — 1 (x64), 0 (ia32), 3 (arm64), etc.
    const { appOutDir, electronPlatformName, arch } = context;

    // Маппинг arch кодов electron-builder
    const archMap = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };
    const archName = archMap[arch] || "x64";

    console.log(
        `\n🎬 [afterPack] Патч ffmpeg для AC3/EAC3 (${electronPlatformName}/${archName})`,
    );

    const platformConfig = CONFIG[electronPlatformName];
    if (!platformConfig) {
        console.warn(
            `⚠️  Неподдерживаемая платформа: ${electronPlatformName}, пропускаем`,
        );
        return;
    }

    const archiveFile = platformConfig[archName];
    if (!archiveFile) {
        console.warn(
            `⚠️  Неподдерживаемая архитектура: ${archName}, пропускаем`,
        );
        return;
    }

    // Находим ffmpeg в собранном приложении
    const ffmpegPath = findFfmpegInAppDir(appOutDir, electronPlatformName);
    if (!ffmpegPath) {
        console.error(
            `❌ ${platformConfig.filename} не найден в ${appOutDir}`,
        );
        return;
    }

    console.log(`📁 Найден: ${ffmpegPath}`);

    // Скачиваем и заменяем
    const tmpDir = path.join(appOutDir, ".tmp-ffmpeg");
    const zipPath = path.join(tmpDir, archiveFile);

    fs.mkdirSync(tmpDir, { recursive: true });

    const url = `${GITHUB_RELEASES_BASE}/${archiveFile}`;
    console.log(`⬇️  Скачиваем: ${archiveFile}`);

    await downloadFile(url, zipPath);

    console.log("📦 Распаковываем...");
    const extractDir = path.join(tmpDir, "extracted");
    await extractZip(zipPath, extractDir);

    const newFfmpeg = path.join(extractDir, platformConfig.filename);
    if (!fs.existsSync(newFfmpeg)) {
        console.error(`❌ ${platformConfig.filename} не найден в архиве`);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
    }

    fs.copyFileSync(newFfmpeg, ffmpegPath);

    const newSize = fs.statSync(ffmpegPath).size;
    console.log(
        `✅ ffmpeg заменён (${(newSize / 1024 / 1024).toFixed(1)} МБ) — AC3/EAC3 включены`,
    );

    // Очистка
    fs.rmSync(tmpDir, { recursive: true, force: true });
};
