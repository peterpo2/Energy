# Energy Desktop

## Българска версия

### 1. Описание на проекта
`Energy Desktop` е Windows desktop приложение за анализ на данни от соларни системи и оптимизация на прозорци за зареждане на батерия.  
Приложението е локално-first и е проектирано да работи офлайн с локална SQLite база.

### 2. Функционалности
- Импорт и обработка на енергийни данни (в процес на разработка)
- Анализ по час/ден/месец (в процес на разработка)
- Night-window оптимизация за зареждане на батерия (в процес на разработка)
- Локално съхранение на история и настройки
- Desktop shell с навигация, базов layout и типизиран IPC слой

### 3. Технологичен стек
- Electron
- React
- TypeScript
- Vite
- TailwindCSS
- SQLite (`better-sqlite3`)

### 4. Архитектурен преглед
- **Electron Main Process**: lifecycle, прозорец, SQLite и IPC handlers
- **Preload Bridge (`contextBridge`)**: сигурен API слой към renderer
- **React Renderer**: UI shell, routing, layout и state
- **Typed IPC**: типизирани request/response DTO контракти
- **Persistence Layer**: локална SQLite схема, миграции и repository слой

### 5. Структура на проекта
```text
energy-desktop/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
  packages/
    analytics/
    ingestion/
    persistence/
    domain/
    shared/
```

### 6. Изисквания
- Node.js 20+
- `pnpm`
- Препоръчителна среда: Windows

### 7. Инсталация
```bash
cd c:\Popoff\Energy
pnpm install
```

### 8. Стартиране в development режим
```bash
pnpm dev
```

Стартира:
- Vite renderer (`http://localhost:5173`)
- Vite watch build за Electron main и preload
- Electron с auto-restart (`electronmon`)

### 9. Build инструкции
```bash
pnpm build
```

Build артефакти:
- `dist/renderer`
- `dist-electron/main/index.js`
- `dist-electron/preload/index.js`

### 10. Налични скриптове

#### Root workspace скриптове
| Скрипт | Описание |
|---|---|
| `pnpm dev` | Стартира desktop app в development режим |
| `pnpm build` | Build на desktop app |
| `pnpm typecheck` | TypeScript проверка |
| `pnpm clean` | Почиства build артефакти |

#### `apps/desktop` скриптове
| Скрипт | Описание |
|---|---|
| `pnpm dev` | Стартира Vite + Electron dev pipeline |
| `pnpm build` | Build на renderer, main и preload |
| `pnpm typecheck` | TypeScript проверка за desktop app |

### 11. База данни (SQLite)
Приложението използва локална SQLite база (`better-sqlite3`) в main процеса.  
Схемата се управлява чрез SQL миграции. Съхраняват се:
- datasets metadata
- measurements
- hourly/daily/monthly aggregates
- night-window analysis резултати
- app settings

### 12. Бъдещ roadmap
- Завършване на ingestion pipeline (валидиране + нормализация)
- Завършване на analytics агрегации и optimizer scoring
- Пълна интеграция на IPC handlers към бизнес логиката
- Експорт на резултати (`xlsx`/`csv`)
- Installer/packaging за Windows

---

## English Version

### 1. Project Description
`Energy Desktop` is a Windows desktop application for solar energy data analysis and battery charging window optimization.  
The application is local-first and designed to run offline with a local SQLite database.

### 2. Features
- Data import and processing pipeline (under development)
- Hourly/daily/monthly analytics (under development)
- Night-window battery charging optimization (under development)
- Local history and settings persistence
- Desktop shell with navigation, base layout, and typed IPC layer

### 3. Technology Stack
- Electron
- React
- TypeScript
- Vite
- TailwindCSS
- SQLite (`better-sqlite3`)

### 4. Architecture Overview
- **Electron Main Process**: app lifecycle, window, SQLite, IPC handlers
- **Preload Bridge (`contextBridge`)**: secure API exposed to renderer
- **React Renderer**: UI shell, routing, layout, and state
- **Typed IPC**: request/response DTO contracts
- **Persistence Layer**: local SQLite schema, migrations, repositories

### 5. Project Structure
```text
energy-desktop/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
  packages/
    analytics/
    ingestion/
    persistence/
    domain/
    shared/
```

### 6. Requirements
- Node.js 20+
- `pnpm`
- Recommended environment: Windows

### 7. Installation
```bash
cd c:\Popoff\Energy
pnpm install
```

### 8. Running in Development
```bash
pnpm dev
```

This starts:
- Vite renderer (`http://localhost:5173`)
- Vite watch build for Electron main and preload
- Electron with auto-restart (`electronmon`)

### 9. Build Instructions
```bash
pnpm build
```

Build outputs:
- `dist/renderer`
- `dist-electron/main/index.js`
- `dist-electron/preload/index.js`

### 10. Available Scripts

#### Root workspace scripts
| Script | Description |
|---|---|
| `pnpm dev` | Run desktop app in development mode |
| `pnpm build` | Build desktop app |
| `pnpm typecheck` | TypeScript type check |
| `pnpm clean` | Clean build artifacts |

#### `apps/desktop` scripts
| Script | Description |
|---|---|
| `pnpm dev` | Run Vite + Electron dev pipeline |
| `pnpm build` | Build renderer, main, and preload |
| `pnpm typecheck` | TypeScript check for desktop app |

### 11. Database (SQLite)
The app uses a local SQLite database (`better-sqlite3`) in the main process.  
Schema management is migration-based. It stores:
- dataset metadata
- measurements
- hourly/daily/monthly aggregates
- night-window analysis results
- app settings

### 12. Future Roadmap
- Complete ingestion pipeline (validation + normalization)
- Complete analytics aggregation and optimizer scoring
- Connect IPC handlers to real business logic
- Implement result export (`xlsx`/`csv`)
- Add Windows installer/packaging

