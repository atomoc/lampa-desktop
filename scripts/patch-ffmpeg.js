#!/usr/bin/env node

/**
 * Скрипт для замены стандартной ffmpeg.dll (без проприетарных кодеков)
 * на версию с поддержкой AC3/EAC3 (Dolby Digital) из проекта nwjs-ffmpeg-prebuilt.
 *
 * Проблема: Стандартный Electron использует открытую сборку Chromium,
 * в которой НЕ включены проприетарные аудиокодеки AC3/EAC3.
 * Edge работает, потому что Microsoft лицензирует эти кодеки в своей сборке Chromium.
 *
 * Решение: Заменяем ffmpeg.dll на сборку из nwjs-ffmpeg-prebuilt,
 * которая скомпилирована с флагами proprietary_codecs=true и ffmpeg_branding="Chrome".
 *
 * Версии Chromium:
 *   Electron 40.3.0 → Chromium 144.0.7559.134
 *   nwjs-ffmpeg-prebuilt 0.107.0 → Chromium 144.0.7559.59
 *   (совместимы — одна мажорная линейка 144.0.7559.x)
 *
 * Использование:
 *   node scripts/patch-ffmpeg.js          — скачать и заменить для текущей платформы
 *   node scripts/patch-ffmpeg.js --check  — только проверить, нужна ли замена
 *   node scripts/patch-ffmpeg.js --restore — восстановить оригинальную ffmpeg
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Версия nwjs-ffmpeg-prebuilt, совместимая с Electron 40.x (Chromium 144)
const NWJS_FFMPEG_VERSION = "0.107.0";
const GITHUB_RELEASES_BASE = `https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/${NWJS_FFMPEG_VERSION}`;

// Маппинг платформ
const PLATFORM_MAP = {
    win32: {
        x64: {
            archive: `${NWJS_FFMPEG_VERSION}-win-x64.zip`,
            ffmpegFile: "ffmpeg.dll",
        },
        ia32: {
            archive: `${NWJS_FFMPEG_VERSION}-win-ia32.zip`,
            ffmpegFile: "ffmpeg.dll",
        },
        arm64: {
            archive: `${NWJS_FFMPEG_VERSION}-win-arm64.zip`,
            ffmpegFile: "ffmpeg.dll",
        },
    },
    linux: {
        x64: {
            archive: `${NWJS_FFMPEG_VERSION}-linux-x64.zip`,
            ffmpegFile: "libffmpeg.so",
        },
        ia32: {
            archive: `${NWJS_FFMPEG_VERSION}-linux-ia32.zip`,
            ffmpegFile: "libffmpeg.so",
        },
    },
    darwin: {
        x64: {
            archive: `${NWJS_FFMPEG_VERSION}-osx-x64.zip`,
            ffmpegFile: "libffmpeg.dylib",
        },
        arm64: {
            archive: `${NWJS_FFMPEG_VERSION}-osx-arm64.zip`,
            ffmpegFile: "libffmpeg.dylib",
        },
    },
};

/**
 * Определяет путь к ffmpeg в Electron dist
 */
function getElectronFfmpegPath() {
    const electronDistPath = path.join(
        __dirname,
        "..",
        "node_modules",
        "electron",
        "dist",
    );

    const platform = process.platform;

    if (platform === "win32") {
        return path.join(electronDistPath, "ffmpeg.dll");
    } else if (platform === "linux") {
        return path.join(electronDistPath, "libffmpeg.so");
    } else if (platform === "darwin") {
        // macOS: Electron Framework.framework/Libraries/libffmpeg.dylib
        return path.join(
            electronDistPath,
            "Electron.app",
            "Contents",
            "Frameworks",
            "Electron Framework.framework",
            "Libraries",
            "libffmpeg.dylib",
        );
    }

    throw new Error(`Неподдерживаемая платформа: ${platform}`);
}

/**
 * Определяет конфигурацию для текущей платформы
 */
function getPlatformConfig() {
    const platform = process.platform;
    const arch = process.arch;

    const platformConfigs = PLATFORM_MAP[platform];
    if (!platformConfigs) {
        throw new Error(`Неподдерживаемая платформа: ${platform}`);
    }

    const config = platformConfigs[arch];
    if (!config) {
        throw new Error(
            `Неподдерживаемая архитектура ${arch} для платформы ${platform}`,
        );
    }

    return config;
}

/**
 * HTTP(S) скачивание с поддержкой редиректов
 */
function downloadFile(url, destPath, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            return reject(new Error("Слишком много редиректов"));
        }

        const protocol = url.startsWith("https") ? https : http;

        protocol
            .get(url, { headers: { "User-Agent": "lampa-desktop" } }, (response) => {
                // Обработка редиректов (301, 302, 303, 307, 308)
                if (
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {
                    return resolve(
                        downloadFile(response.headers.location, destPath, maxRedirects - 1),
                    );
                }

                if (response.statusCode !== 200) {
                    return reject(
                        new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
                    );
                }

                const totalBytes = parseInt(response.headers["content-length"], 10);
                let downloadedBytes = 0;

                const file = fs.createWriteStream(destPath);

                response.on("data", (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes) {
                        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                        process.stdout.write(
                            `\r  Скачано: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} МБ)`,
                        );
                    }
                });

                response.pipe(file);

                file.on("finish", () => {
                    file.close();
                    console.log(""); // новая строка после прогресса
                    resolve();
                });

                file.on("error", (err) => {
                    fs.unlinkSync(destPath);
                    reject(err);
                });
            })
            .on("error", reject);
    });
}

/**
 * Распаковка ZIP-архива (без внешних зависимостей)
 * Используем встроенные средства ОС
 */
async function extractZip(zipPath, destDir) {
    const { execSync } = require("child_process");

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    if (process.platform === "win32") {
        // PowerShell для Windows
        execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
            { stdio: "pipe" },
        );
    } else {
        // unzip для Linux/macOS
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "pipe" });
    }
}

/**
 * Проверяет размер файла ffmpeg — оригинальный (~3 МБ) vs с кодеками (~1.5 МБ сжатый → ~5 МБ)
 */
function checkFfmpegStatus(ffmpegPath) {
    if (!fs.existsSync(ffmpegPath)) {
        return { exists: false, patched: false, size: 0 };
    }

    const stats = fs.statSync(ffmpegPath);
    const sizeKB = stats.size / 1024;

    // Оригинальный ffmpeg.dll от Electron ~3 МБ (3089920 bytes)
    // Пропатченный с проприетарными кодеками обычно ~5+ МБ
    const originalSize = 3089920;
    const isLikelyOriginal = Math.abs(stats.size - originalSize) < 100000; // ±100 КБ

    return {
        exists: true,
        patched: !isLikelyOriginal,
        size: stats.size,
        sizeKB: sizeKB.toFixed(0),
        sizeMB: (sizeKB / 1024).toFixed(1),
    };
}

/**
 * Основная функция замены ffmpeg
 */
async function patchFfmpeg() {
    console.log("🎬 Патч ffmpeg для поддержки AC3/EAC3 кодеков");
    console.log(
        `   Версия nwjs-ffmpeg-prebuilt: ${NWJS_FFMPEG_VERSION} (Chromium 144.0.7559.x)\n`,
    );

    const config = getPlatformConfig();
    const ffmpegPath = getElectronFfmpegPath();

    console.log(`📁 Путь к ffmpeg: ${ffmpegPath}`);

    // Проверяем текущее состояние
    const status = checkFfmpegStatus(ffmpegPath);
    if (!status.exists) {
        console.error("❌ ffmpeg не найден! Убедитесь, что electron установлен.");
        process.exit(1);
    }

    console.log(
        `📊 Текущий ffmpeg: ${status.sizeMB} МБ (${status.patched ? "уже пропатчен ✅" : "оригинальный, без AC3 ⚠️"})`,
    );

    if (status.patched) {
        console.log("✅ ffmpeg уже содержит проприетарные кодеки. Патч не нужен.");
        return;
    }

    // Создаём бэкап оригинала
    const backupPath = ffmpegPath + ".original";
    if (!fs.existsSync(backupPath)) {
        console.log("💾 Создаём бэкап оригинальной ffmpeg...");
        fs.copyFileSync(ffmpegPath, backupPath);
        console.log(`   Бэкап: ${backupPath}`);
    }

    // Скачиваем
    const tmpDir = path.join(__dirname, "..", ".tmp-ffmpeg");
    const zipPath = path.join(tmpDir, config.archive);

    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const downloadUrl = `${GITHUB_RELEASES_BASE}/${config.archive}`;
    console.log(`\n⬇️  Скачиваем: ${config.archive}`);
    console.log(`   URL: ${downloadUrl}`);

    try {
        await downloadFile(downloadUrl, zipPath);
    } catch (error) {
        console.error(`❌ Ошибка скачивания: ${error.message}`);
        process.exit(1);
    }

    // Распаковываем
    console.log("📦 Распаковываем...");
    const extractDir = path.join(tmpDir, "extracted");
    await extractZip(zipPath, extractDir);

    // Находим файл ffmpeg в распакованном архиве
    const extractedFfmpeg = path.join(extractDir, config.ffmpegFile);
    if (!fs.existsSync(extractedFfmpeg)) {
        console.error(
            `❌ Файл ${config.ffmpegFile} не найден в архиве! Содержимое:`,
        );
        console.error(fs.readdirSync(extractDir));
        process.exit(1);
    }

    // Заменяем
    console.log(`🔄 Заменяем ${config.ffmpegFile}...`);
    fs.copyFileSync(extractedFfmpeg, ffmpegPath);

    // Проверяем результат
    const newStatus = checkFfmpegStatus(ffmpegPath);
    console.log(
        `\n✅ Готово! Новый ffmpeg: ${newStatus.sizeMB} МБ (${newStatus.patched ? "с AC3/EAC3 кодеками" : "внимание: размер не изменился"})`,
    );

    // Очищаем временные файлы
    console.log("🧹 Очистка временных файлов...");
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log("\n🎉 AC3/EAC3 кодеки успешно добавлены!");
    console.log(
        "   Теперь звук должен работать без внешнего плеера.\n",
    );
}

/**
 * Восстановление оригинальной ffmpeg
 */
function restoreFfmpeg() {
    console.log("🔄 Восстановление оригинальной ffmpeg...");

    const ffmpegPath = getElectronFfmpegPath();
    const backupPath = ffmpegPath + ".original";

    if (!fs.existsSync(backupPath)) {
        console.error("❌ Бэкап не найден! Переустановите electron.");
        process.exit(1);
    }

    fs.copyFileSync(backupPath, ffmpegPath);
    console.log("✅ Оригинальная ffmpeg восстановлена.");
}

/**
 * Проверка состояния
 */
function checkStatus() {
    const ffmpegPath = getElectronFfmpegPath();
    const status = checkFfmpegStatus(ffmpegPath);

    console.log("📊 Статус ffmpeg:");
    console.log(`   Путь: ${ffmpegPath}`);
    console.log(`   Существует: ${status.exists ? "да" : "нет"}`);

    if (status.exists) {
        console.log(`   Размер: ${status.sizeMB} МБ (${status.size} байт)`);
        console.log(
            `   Кодеки AC3/EAC3: ${status.patched ? "✅ присутствуют" : "❌ отсутствуют"}`,
        );

        const backupPath = ffmpegPath + ".original";
        console.log(
            `   Бэкап оригинала: ${fs.existsSync(backupPath) ? "✅ есть" : "❌ нет"}`,
        );
    }
}

// Обработка аргументов командной строки
const args = process.argv.slice(2);

if (args.includes("--check")) {
    checkStatus();
} else if (args.includes("--restore")) {
    restoreFfmpeg();
} else {
    patchFfmpeg().catch((error) => {
        console.error("❌ Критическая ошибка:", error);
        process.exit(1);
    });
}
