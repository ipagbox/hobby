# Architecture — Agents Pipeline

## Overview

Agents Pipeline — воспроизводимый конвейер разработки клиентских сайтов.
Вход: короткий бизнес-бриф. Выход: полный набор артефактов от исследования до frontend-кода.

**Система создана для тестирования coding-agents на длинной дистанции.**

---

## Core Design Principles

### 1. File-first, not chat-first

Никакого неявного context между stages. Каждая stage:
- читает строго определённые входные файлы
- пишет строго определённые выходные файлы
- не знает о других stages кроме своего контракта

### 2. Explicit contracts

Каждая stage имеет machine-readable контракт (`pipeline/contracts/*.yaml`) с:
- входными артефактами (key, path, required, schema)
- выходными артефактами (key, path, schema)
- допустимыми источниками данных
- критериями завершения
- известными рисками

### 3. Versioned artifacts

Каждый запуск stage создаёт `v{n}/` директорию. Симлинк `current →` всегда указывает на активную версию. Историю можно просмотреть в `stage-log.yaml`. Это позволяет перезапускать отдельные stages без потери предыдущих результатов.

### 4. Clear separation

| Компонент | Тип | Что делает |
|-----------|-----|------------|
| `Pipeline.init_run()` | Детерминированный | Создаёт структуру run |
| `Pipeline._collect_inputs()` | Детерминированный | Читает файлы по контракту |
| `Pipeline._build_prompt()` | Детерминированный | Собирает промпт из шаблона + inputs |
| `Pipeline._call_llm()` | **LLM** | Вызов Claude API |
| `Pipeline._save_outputs()` | Детерминированный | Пишет файлы из LLM-вывода |
| `Pipeline._update_stage_status()` | Детерминированный | Обновляет метаданные |
| stages с `review_required: true` | **Ручная** | Требуют проверки перед продолжением |

---

## Data Flow

```
brief.yaml
    │
    ▼
┌─────────────────────────────────────────────┐
│  Stage 00-normalize                         │
│  Input: brief.yaml                          │
│  Output: project-brief.yaml                 │
└───────────────────┬─────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │                     │
┌────────▼──────┐   ┌──────────▼──────────┐
│ 01-discovery  │   │  (parallel possible) │
│ Output:       │   └─────────────────────┘
│ discovery-    │
│ report.md     │
└──────┬────────┘
       │
┌──────▼────────┐
│ 02-competitor │  ← requires review_required
│ Output:       │
│ competitor-   │
│ analysis.md   │
└──────┬────────┘
       │
┌──────▼────────┐
│ 03-seo        │
│ Output:       │
│ keyword-      │
│ map.md        │
└──────┬────────┘
       │
┌──────▼────────┐
│ 04-ia         │
│ Output:       │
│ sitemap.md    │
│ page-types.md │
└──────┬────────┘
       │
┌──────▼────────┐
│ 05-design     │  ← requires review_required
│ Output:       │
│ design-       │
│ system-       │
│ brief.md      │
└──────┬────────┘
       │
┌──────▼────────┐
│ 06-content-   │
│ model         │
│ Output:       │
│ content-      │
│ model.md      │
│ page-         │
│ briefs.md     │
└──────┬────────┘
       ├──────────────────────┐
┌──────▼────────┐   ┌────────▼──────────┐
│ 07-frontend   │   │ 08-backend        │
│ Output: src/  │   │ Output: src/      │
└──────┬────────┘   └────────┬──────────┘
       └──────────┬───────────┘
┌─────────────────▼─────────────┐
│ 09-content-gen                 │
│ Output: pages/*.md             │
└────────────────┬───────────────┘
                 │
┌────────────────▼───────────────┐
│ 10-qa                          │  ← requires review_required
│ Output: launch-checklist.md    │
│         final-report.md        │
│         seo-audit.md           │
└────────────────────────────────┘
```

---

## Run Directory Structure

```
runs/{run-id}/
├── brief.yaml                        # Копия входного брифа
├── run-metadata.yaml                 # Состояние всего run
├── artifact-index.yaml               # Индекс всех артефактов
└── stages/
    ├── 00-normalize/
    │   ├── stage-log.yaml            # Лог всех запусков stage
    │   ├── v1/
    │   │   └── project-brief.yaml
    │   └── current -> v1/            # Симлинк на текущую версию
    ├── 01-discovery/
    │   ├── stage-log.yaml
    │   ├── v1/
    │   │   └── discovery-report.md
    │   ├── v2/                       # После rerun
    │   │   └── discovery-report.md
    │   └── current -> v2/
    └── ... (аналогично)
```

---

## Manifest Formats

### run-metadata.yaml

```yaml
run_id: "santehnika-moskva-20260325-abc123"
project_name: "Сантехника Мастер"
project_type: "local_business_website"
status: "in_progress"              # pending | in_progress | completed | failed | partial
stages:
  00-normalize:
    status: "completed"            # pending | in_progress | completed | failed | review_required | skipped
    versions: 1
    current_version: 1
    started_at: "2026-03-25T10:00:00Z"
    completed_at: "2026-03-25T10:01:30Z"
    model: "claude-opus-4-6"
    input_tokens: 1200
    output_tokens: 800
  01-discovery:
    status: "review_required"
```

### artifact-index.yaml

```yaml
run_id: "santehnika-moskva-20260325-abc123"
updated_at: "2026-03-25T10:01:30Z"
artifacts:
  - stage_id: "00-normalize"
    key: "project_brief"
    path: "stages/00-normalize/current/project-brief.yaml"
    version: 1
    created_at: "2026-03-25T10:01:30Z"
    status: "created"
    size_bytes: 1024
```

---

## Technology Stack

| Компонент | Технология | Зачем |
|-----------|-----------|-------|
| Оркестратор | Python 3.10+ | Файловый I/O, YAML, subprocess |
| LLM API | Anthropic Python SDK | Claude API с streaming |
| Конфиги | YAML | Декларативно, читаемо |
| Валидация | jsonschema | Проверка артефактов |
| Артефакты | Markdown / YAML | Читаемы и версионируемы |
| Версионирование | Симлинки + директории | Простая история без git |

---

## Supported Project Types

| Тип | ID | Пропускаемые stages |
|-----|-----|---------------------|
| Сайт услуг | `local_business_website` | Нет (все stages) |
| Лендинг | `landing` | `02-competitor`, `04-ia` |
| Корпоративный | `corporate` | Нет (все stages) |

Настраивается в `pipeline/stages.yaml` → `project_types`.
