/**
 * Скрипт сборки .deb пакета для Linux arm64
 * 
 * Использование: yarn build-deb-arm64
 * 
 * Требования:
 *   - WSL с Ubuntu (apt install ruby ruby-dev build-essential && gem install fpm)
 *   - electron-builder
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;
const ARCH = "arm64";
const APP_NAME = "lampa";
const DIST_DIR = path.join(ROOT, "dist");
const UNPACKED_DIR = path.join(DIST_DIR, `linux-${ARCH}-unpacked`);
const DEB_PATH = path.join(DIST_DIR, `${APP_NAME}-${ARCH}-${VERSION}.deb`);
const STAGING_DIR = path.join(DIST_DIR, ".deb-staging");

function run(cmd, opts = {}) {
    console.log(`\n▶ ${cmd}\n`);
    execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function toWslPath(winPath) {
    return winPath
        .replace(/\\/g, "/")
        .replace(/^([A-Za-z]):/, (_, letter) => `/mnt/${letter.toLowerCase()}`);
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ─── Шаг 1: Сборка через electron-builder ───
console.log("═══════════════════════════════════════");
console.log(`  Сборка Lampa v${VERSION} .deb (${ARCH})`);
console.log("═══════════════════════════════════════");

run(`npx electron-builder --linux --dir --${ARCH} --publish=never`);

// ─── Шаг 2: Создание staging директории ───
console.log("\n📦 Подготовка staging директории...");

if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}

// Копируем приложение в /opt/lampa/
const optDir = path.join(STAGING_DIR, "opt", APP_NAME);
copyDirSync(UNPACKED_DIR, optDir);

// Создаём .desktop файл
const appsDir = path.join(STAGING_DIR, "usr", "share", "applications");
fs.mkdirSync(appsDir, { recursive: true });
fs.writeFileSync(path.join(appsDir, `${APP_NAME}.desktop`), `[Desktop Entry]
Name=Lampa
Comment=Медиа-клиент Lampa
Exec=/opt/${APP_NAME}/${APP_NAME}-desktop --no-sandbox %U
Icon=/opt/${APP_NAME}/icon.png
Terminal=false
Type=Application
Categories=AudioVideo;Video;Player;
MimeType=x-scheme-handler/magnet;
StartupWMClass=lampa
`);

// Копируем иконку
const iconSrc = path.join(ROOT, "assets", "fallback.png");
const iconsDir = path.join(STAGING_DIR, "usr", "share", "icons", "hicolor", "256x256", "apps");
fs.mkdirSync(iconsDir, { recursive: true });
fs.copyFileSync(iconSrc, path.join(iconsDir, `${APP_NAME}.png`));
// Также кладём иконку прямо в /opt/lampa/ (для .desktop с полным путём)
fs.copyFileSync(iconSrc, path.join(optDir, "icon.png"));

// Создаём launcher скрипт
const binDir = path.join(STAGING_DIR, "usr", "bin");
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(
    path.join(binDir, APP_NAME),
    `#!/bin/sh\nexec /opt/${APP_NAME}/${APP_NAME}-desktop --no-sandbox "$@"\n`
);

// ─── Шаг 3: Сборка .deb через WSL + fpm ───
console.log("\n📦 Сборка .deb через WSL + fpm...");

const wslStaging = toWslPath(STAGING_DIR);
const wslDeb = toWslPath(DEB_PATH);
const wslBin = `${wslStaging}/usr/bin/${APP_NAME}`;

const fpmCmd = `chmod +x ${wslBin} && fpm -s dir -t deb -n ${APP_NAME} -v ${VERSION} -a ${ARCH} --description 'Lampa Desktop' --category Multimedia --url 'https://github.com/Kolovatoff/lampa-desktop' --license MIT -f -p ${wslDeb} -C ${wslStaging} .`;

run(`wsl -d Ubuntu -- bash -c "${fpmCmd}"`);

// ─── Шаг 4: Очистка ───
fs.rmSync(STAGING_DIR, { recursive: true, force: true });

const debSize = (fs.statSync(DEB_PATH).size / 1024 / 1024).toFixed(1);

console.log("\n═══════════════════════════════════════");
console.log(`  ✅ Готово! ${path.basename(DEB_PATH)}`);
console.log(`  📦 Размер: ${debSize} МБ`);
console.log(`  📂 Путь: ${DEB_PATH}`);
console.log("═══════════════════════════════════════\n");
