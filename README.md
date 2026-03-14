# 🎬 Lampa Desktop

[![GitHub All Releases](https://img.shields.io/endpoint?url=https://lampa.kolovatoff.ru/github/downloads)](https://github.com/Kolovatoff/lampa-desktop/releases)
[![GitHub Release](https://img.shields.io/github/v/release/Kolovatoff/lampa-desktop?style=for-the-badge&logo=github)](https://github.com/Kolovatoff/lampa-desktop/releases)
[![License](https://img.shields.io/github/license/Kolovatoff/lampa-desktop?style=for-the-badge&color=blue)](LICENSE)

![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)
![macOS](https://img.shields.io/badge/mac%20os-000000?style=for-the-badge&logo=macos&logoColor=F0F0F0)

> **Неофициальный** десктоп-клиент для просмотра фильмов и сериалов  
> Построен на базе **Electron**, использует API сторонних сервисов.

---

## 🔧 Возможности

✅ Поддержка **Windows, Linux, macOS**  
✅ Синхронизация с **VLC Timecode** (просмотр в VLC)  
✅ Динамическая загрузка Lampa с `lampa.mx` или кастомного URL  
✅ Экспорт/импорт конфигурации между устройствами  
✅ Встроенные настройки: смена URL, полноэкранный режим и др.  
✅ Поддержка `window.location.reload()`  
✅ Сохранение позиции окна, размера и монитора  
✅ Кнопка закрытия приложения  
✅ Автоматические обновления  
✅ Встроенная поддержка **TorrServer**  
✅ Автообнаружение VLC при запуске

---

## 📦 Установка

Скачайте последнюю версию из [релизов](https://github.com/Kolovatoff/lampa-desktop/releases):

1. Выберите подходящий установщик:
   - `.exe` — для Windows
   - `.AppImage` / `.deb` — для Linux
   - `.dmg` — для macOS
2. Установите и наслаждайтесь!

---

## 🔄 Экспорт и импорт настроек

Переносите свои настройки между устройствами или резервируйте их:

- [📖 Подробнее: Экспорт/Импорт](docs/export-import.md)

---

## 🛠 Разработка и сборка (Особые случаи)

### Сборка для Linux ARM64 (Orange Pi / Raspberry Pi)
Чтобы собрать `.deb` пакет для архитектуры ARM64 на Windows, используется скрипт:
```bash
yarn run build-deb-arm64
```
**Требования для сборки на Windows:**
- Установленный и работающий WSL с дистрибутивом **Ubuntu** (по умолчанию `wsl -d Ubuntu`).
- Внутри WSL должны быть пакеты: `apt install ruby ruby-dev build-essential && gem install fpm`.
Скрипт использует `electron-builder` для трансляции бинарников и `fpm` через `wsl` для создания итогового `/dist/*.deb`.

### Тонкости аппаратного ускорения и GPU (RK3588, Mali)
Конфигурация Lampa содержит параметры для разгрузки CPU. Однако, для нормальной работы на платах типа Orange Pi 5 с видеоядром Mali (RK3588, Panfrost) учтите следующее:
1. **Ошибка Vulkan:** Флаг запуска Electron `Vulkan` может вызывать краш GPU Process (ошибка `vkCreateInstance() failed: -9`). Он **вырезан** из `src/modules/appLifecycle.js` в версии 1.2.7.
2. **Ошибка ANGLE:** Флаг `--use-gl=egl` в `.desktop` ярлыке вызывает завершение отрисовки без интерфейса на некоторых драйверах. Он убран из скрипта сборки пакета.
3. **FFmpeg и звук:** Если при воспроизведении тяжелых форматов (AC3/Dolby) загрузка CPU достигает 100%, убедитесь, что в `src/modules/audioTranscoder.js` используется флаг без перекодирования видеопотока: `-c:v copy` вместо программного `libx264`.

### TorrServer и контекст Electron
Для нормального доступа TorrServer'а к сетевым модулям, `nodeIntegration` в `windowManager.js` оставлено в значении `false` для безопасности (с `contextIsolation: true`). Для предотвращения ошибки `require is not defined` в сторонних Web-плагинах ТоррСервера, в файле `src/preload.js` инжектируется специальная безопасная заглушка `require` через `contextBridge`.

---

Исходный код оригинального Web-интерфейса **Lampa** доступен здесь:  
👉 [yumata/lampa-source](https://github.com/yumata/lampa-source)

---

## 📢 Обратная связь

По вопросам, багам и предложениям — пишите в Telegram:  
👉 [@lampa_desktop](http://t.me/lampa_desktop)

---

## 📄 Лицензия

Этот проект распространяется под лицензией **GPL-2.0**.  
Подробнее см. в файле [LICENSE](LICENSE).

---

⭐ Если проект полезен — поставьте звезду!
