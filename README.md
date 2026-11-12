# AppleLauncher

Лаунчер Minecraft: Java Edition для Windows: монохромный интерфейс, официальный вход через Microsoft, установка версий и загрузчиков (Fabric, Forge, NeoForge, Quilt), моды и сборки с Modrinth, импорт сборок из Prism Launcher и TLauncher.

> **English.** AppleLauncher is a free, open-source (MIT) launcher for Minecraft: Java Edition on Windows. Players sign in with their own Microsoft account (OAuth 2.0 + PKCE in the system browser; the launcher never sees the password), and the game launches only for accounts that own it: there is no offline or cracked mode. It installs official versions and the Fabric, Forge, NeoForge and Quilt loaders, and manages mods and modpacks from Modrinth. Game files come only from official servers and are checked by hash. Not affiliated with Mojang or Microsoft.

Electron 45, TypeScript, React 19, Vite (electron-vite), Tailwind 4, Framer Motion, lucide-react. Установку и запуск игры выполняют `@xmcl/core` и `@xmcl/installer`.

## Быстрый старт

```bash
npm install
```

```bash
npm run dev
```

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Запуск в режиме разработки с горячей перезагрузкой интерфейса |
| `npm run typecheck` | Проверка типов main/preload и renderer |
| `npm test` | Юнит-тесты чистых функций (`tests/`) |
| `npm run build` | Сборка в `out/` |
| `npm run dist` | Проверка типов, сборка и установщик NSIS в `dist/AppleLauncher-Setup-<версия>.exe` |
| `node scripts/make-icon.mjs` | Пересоздать `build/icon.png` |

Нужен Node.js 22.6 или новее: тесты запускают TypeScript без сборки.

## Что нужно настроить самостоятельно

### 1. Вход через Microsoft

Лаунчер не собирает пароли: вход проходит в системном браузере по OAuth 2.0 + PKCE, ответ возвращается на `http://localhost:<порт>`.

В лаунчер встроен Client ID приложения Azure «AppleLauncher» (`cf19bd3a-0d9c-4c7a-b791-4ca1647cb852`, личные учётные записи Microsoft); пользователям ничего настраивать не нужно. Client ID — не секрет, его можно хранить в коде.

**Обязательно один раз:** подать заявку Mojang на доступ к Minecraft API с этим ID: [aka.ms/mce-reviewappid](https://aka.ms/mce-reviewappid). Пока заявка не одобрена, вход доходит до последнего шага и лаунчер сообщает, что приложение не одобрено Mojang.

В приложении Azure должны быть: Redirect URI `http://localhost` на платформе «Мобильные и классические приложения» и «Разрешить потоки общедоступных клиентов» = «Да» (раздел «Проверка подлинности»).

Свой ID можно подставить в **Настройки → Дополнительно** или переменной окружения `APPLELAUNCHER_MS_CLIENT_ID`. Порядок: поле в настройках, затем переменная, затем встроенный ID.

Других ключей не нужно: Modrinth, Mojang, Fabric, Quilt, Forge и NeoForge работают без API-ключей.

### 2. Автообновления (по желанию)

Обновления берутся из релизов репозитория `ssearazer/applelauncher` (см. `electron-builder.yml`). Публикуйте релизы с `.exe`, `.exe.blockmap` и `latest.yml` из `dist/`. Установленный лаунчер проверяет обновления при запуске (это можно отключить в настройках) и ставит их при выходе.

### 3. Подпись кода (по желанию)

Без сертификата Windows SmartScreen покажет предупреждение при первом запуске установщика. Для подписи задайте `CSC_LINK` и `CSC_KEY_PASSWORD` перед `npm run dist`.

## Как это устроено

```
src/main/        процесс Electron: окно, IPC, установка и запуск игры, аккаунты, моды, сборки
src/preload/     узкий API window.api через contextBridge
src/renderer/    интерфейс React
src/shared/      общие типы и чистые функции
tests/           тесты node:test
```

- **Запуск:** профиль → обновление токена → Java (рантайм Mojang для нужной версии или свой путь) → клиент, библиотеки и ресурсы с проверкой SHA-1 → установка загрузчика → аргументы → отдельный процесс → журнал `logs/latest-game.log` и отслеживание падений.
- **Данные:** настройки, профили и аккаунты лежат JSON-файлами в `%APPDATA%/AppleLauncher` и записываются атомарно. Игра по умолчанию живёт в `%APPDATA%/.applelauncher`, у каждого профиля своя папка `instances/<id>`.
- **Токены:** refresh-токен Microsoft и токен Minecraft шифруются через Electron `safeStorage` (Windows DPAPI, привязка к пользователю Windows).

## Безопасность

- `contextIsolation`, `sandbox`, `nodeIntegration: false`, строгая CSP, переходы и новые окна заблокированы, все запросы разрешений отклоняются.
- Каждый IPC-канал проверяет отправителя и аргументы схемами zod; лишние аргументы отклоняются.
- Пути из архивов и ответов API проходят `safeJoin` и не выходят за папку профиля. Файлы и папки пользователь выбирает только в системных диалогах.
- Загрузки идут только по HTTPS, во временный файл, с проверкой SHA-1/SHA-512 и повторами с паузой. В `.mrpack` разрешены лишь хосты из белого списка Modrinth.
- Внешние ссылки открываются только для белого списка доменов.
- Нет офлайн-режима и обхода лицензии: без купленной игры Mojang вернёт отказ, и лаунчер скажет, что лицензии нет.

## Отступления от макета

- Вторичный текст в светлой теме — `#737373` вместо `#777777`: `#777` на белом даёт контраст 4.48:1, ниже порога WCAG 4.5:1.
- Кнопки окна — системные кнопки Windows (`titleBarOverlay`) со Snap Layouts, а не «светофор» macOS.

## Известные ограничения

- Размер загрузки до установки не показывается: точный объём известен только после разбора манифеста версии; прогресс показывает скачанное и общее.
- Каталог версий показывает Release и Snapshot; старые alpha и beta скрыты.
- Подтверждение удаления версии или мода — системный диалог Windows.
- Названия фоновых задач в верхней полосе пока только на русском.

## Лицензия

MIT, см. [LICENSE](LICENSE). Minecraft — товарный знак Mojang AB; проект не связан с Mojang и Microsoft.
