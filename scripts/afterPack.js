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
        // arm64 не доступен в nwjs-ffmpeg-prebuilt — AC3 будет работать через наш audioTranscoder
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

    // Находим ffmpeg в собранном приложении
    const ffmpegPath = findFfmpegInAppDir(appOutDir, electronPlatformName);
    if (!ffmpegPath) {
        console.error(
            `❌ ${platformConfig.filename} не найден в ${appOutDir}`,
        );
        return;
    }

    console.log(`📁 Найден: ${ffmpegPath}`);

    // Скачиваем и заменяем Chromium ffmpeg (только если есть для этой комбинации)
    if (archiveFile) {
        const tmpDir = path.join(appOutDir, ".tmp-ffmpeg");
        const zipPath = path.join(tmpDir, archiveFile);

        fs.mkdirSync(tmpDir, { recursive: true });

        const url = `${GITHUB_RELEASES_BASE}/${archiveFile}`;
        console.log(`⬇️  Скачиваем Chromium ffmpeg: ${archiveFile}`);

        await downloadFile(url, zipPath);

        console.log("📦 Распаковываем...");
        const extractDir = path.join(tmpDir, "extracted");
        await extractZip(zipPath, extractDir);

        const newFfmpeg = path.join(extractDir, platformConfig.filename);
        if (!fs.existsSync(newFfmpeg)) {
            console.error(`❌ ${platformConfig.filename} не найден в архиве`);
        } else {
            fs.copyFileSync(newFfmpeg, ffmpegPath);
            const newSize = fs.statSync(ffmpegPath).size;
            console.log(
                `✅ Chromium ffmpeg заменён (${(newSize / 1024 / 1024).toFixed(1)} МБ) — AC3/EAC3 включены`,
            );
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } else {
        console.log(`⚠️  Chromium ffmpeg патч недоступен для ${archName}, пропускаем`);
    }

    // =====================================================
    // Замена ffmpeg-static бинарника для целевой платформы
    // При кросс-компиляции (напр. Windows → Linux arm64)
    // в пакете оказывается ffmpeg.exe вместо Linux-бинарника
    // =====================================================
    await patchFfmpegStatic(appOutDir, electronPlatformName, archName);
};

/**
 * Скачивает и подменяет ffmpeg-static бинарник для целевой платформы
 */
async function patchFfmpegStatic(appOutDir, platform, arch) {
    const FFMPEG_STATIC_RELEASE = "b6.1.1";
    const FFMPEG_STATIC_BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_RELEASE}`;

    // Определяем имя бинарника для целевой платформы
    const targetExeName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const downloadName = `ffmpeg-${platform}-${arch}.gz`;

    // Ищем ffmpeg-static в asar.unpacked
    const unpackedDir = path.join(appOutDir, "resources", "app.asar.unpacked", "node_modules", "ffmpeg-static");
    if (!fs.existsSync(unpackedDir)) {
        console.log(`⚠️  ffmpeg-static не найден в asar.unpacked, пропускаем`);
        return;
    }

    const targetPath = path.join(unpackedDir, targetExeName);

    // Удаляем бинарники от другой платформы
    for (const f of fs.readdirSync(unpackedDir)) {
        if (f.startsWith("ffmpeg") && (f.endsWith(".exe") || !f.includes("."))) {
            const fullPath = path.join(unpackedDir, f);
            if (f !== targetExeName) {
                fs.unlinkSync(fullPath);
                console.log(`🗑️  Удалён неподходящий бинарник: ${f}`);
            }
        }
    }

    const downloadUrl = `${FFMPEG_STATIC_BASE}/${downloadName}`;
    const tmpDir = path.join(appOutDir, ".tmp-ffmpeg-static");
    const gzPath = path.join(tmpDir, downloadName);
    fs.mkdirSync(tmpDir, { recursive: true });

    console.log(`⬇️  Скачиваем ffmpeg-static для ${platform}-${arch}...`);

    try {
        await downloadFile(downloadUrl, gzPath);

        // Распаковываем .gz
        const zlib = require("zlib");
        const gzData = fs.readFileSync(gzPath);
        const ffmpegBin = zlib.gunzipSync(gzData);
        fs.writeFileSync(targetPath, ffmpegBin);
        fs.chmodSync(targetPath, 0o755);

        const sizeMB = (ffmpegBin.length / 1024 / 1024).toFixed(1);
        console.log(`✅ ffmpeg-static заменён на ${platform}-${arch} (${sizeMB} МБ)`);
    } catch (err) {
        console.error(`❌ Не удалось скачать ffmpeg-static для ${platform}-${arch}:`, err.message);
        console.log(`⚠️  Транскодирование AC3→AAC может не работать на целевой платформе`);
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
}
