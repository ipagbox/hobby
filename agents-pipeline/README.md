# Agents Pipeline

Воспроизводимый конвейер разработки клиентских сайтов на базе Claude AI.

Вход — короткий бизнес-бриф. Выход — полный набор артефактов: исследование рынка, SEO, информационная архитектура, дизайн-бриф, контент, фронтенд, бэкенд, QA-отчёт.

---

## Концепция

Каждый stage — отдельный agent с ролью, промптом и контрактом. Stages общаются только через файловые артефакты — никакого неявного chat context между ними.

```
Brief → [00-normalize] → [01-discovery] → [02-competitor] → [03-seo]
     → [04-ia] → [05-design] → [06-content-model] → [07-frontend]
     → [08-backend] → [09-content-gen] → [10-qa] → Launch Artifacts
```

---

## Quick Start

```bash
cd agents-pipeline/

# Установить зависимости
pip install -r requirements.txt

# Установить API ключ
export ANTHROPIC_API_KEY="sk-ant-..."

# Инициализировать run
python scripts/run.py init --brief examples/plumbing-moscow/brief.yaml
# → Run ID: santehnika-moskva-20260325-abc123

# Запустить полный pipeline
python scripts/run.py pipeline --run-id santehnika-moskva-20260325-abc123

# Проверить статус
python scripts/run.py status --run-id santehnika-moskva-20260325-abc123
```

---

## Структура директорий

```
agents-pipeline/
├── pipeline/
│   ├── stages.yaml          # Реестр всех stages
│   ├── orchestrator.py      # Ядро оркестратора
│   └── contracts/           # Input/output контракты (11 файлов)
├── prompts/                 # Role-agent промпты (11 .md файлов)
├── schemas/                 # JSON Schema для валидации артефактов
├── templates/               # Шаблоны артефактов (справочные)
├── scripts/
│   ├── run.py               # CLI: init / pipeline / stage / status / list
│   └── validate.py          # Валидация артефактов
├── docs/
│   ├── architecture.md      # Архитектура и data flow
│   ├── stages-reference.md  # Справочник по stages
│   ├── extending.md         # Как расширить pipeline
│   └── operations.md        # Эксплуатация и дебаг
├── examples/
│   └── plumbing-moscow/     # Демо: сантехника в Москве
└── runs/                    # Runtime директория (в .gitignore)
```

---

## Stages

| # | ID | Роль | Review |
|---|-----|------|--------|
| 0 | `00-normalize` | Project Analyst | — |
| 1 | `01-discovery` | Market Research Analyst | — |
| 2 | `02-competitor` | Competitive Intelligence Analyst | ⚠️ да |
| 3 | `03-seo` | SEO Strategist | — |
| 4 | `04-ia` | Information Architect | — |
| 5 | `05-design` | Brand & Design Strategist | ⚠️ да |
| 6 | `06-content-model` | Content Strategist | — |
| 7 | `07-frontend` | Frontend Engineer | — |
| 8 | `08-backend` | Backend Engineer | — |
| 9 | `09-content-gen` | Content Writer | — |
| 10 | `10-qa` | QA & SEO Auditor | ⚠️ да |

Stages с ⚠️ требуют ручной проверки — pipeline паузируется и ждёт явного продолжения.

---

## CLI

```bash
# Инициализировать run
python scripts/run.py init --brief <path-to-brief.yaml>

# Запустить полный pipeline
python scripts/run.py pipeline --run-id <id>

# Запустить диапазон stages
python scripts/run.py pipeline --run-id <id> --from-stage 03-seo --to-stage 06-content-model

# Запустить одну stage
python scripts/run.py stage --run-id <id> --stage 01-discovery

# Повторный запуск (сохраняет историю версий)
python scripts/run.py stage --run-id <id> --stage 01-discovery --rerun

# Dry run (строит промпт без вызова LLM)
python scripts/run.py stage --run-id <id> --stage 01-discovery --dry-run

# Статус run
python scripts/run.py status --run-id <id>

# Список всех runs
python scripts/run.py list

# Валидация артефактов
python scripts/validate.py --run-id <id>
python scripts/validate.py --brief examples/plumbing-moscow/brief.yaml
```

---

## Versioning

Каждый повторный запуск stage сохраняет историю:

```
runs/{run-id}/stages/01-discovery/
├── stage-log.yaml
├── v1/
│   └── discovery-report.md   # первый запуск
├── v2/
│   └── discovery-report.md   # после --rerun
└── current -> v2/            # симлинк на активную версию
```

---

## Review Required Stages

Три stages требуют ручной проверки перед продолжением: `02-competitor`, `05-design`, `10-qa`.

Pipeline паузируется со статусом `review_required`. После проверки:

```bash
# Продолжить pipeline с следующей stage
python scripts/run.py pipeline --run-id <id> --from-stage 03-seo
```

---

## Документация

- [Архитектура](docs/architecture.md) — data flow, форматы манифестов
- [Справочник stages](docs/stages-reference.md) — входы, выходы, критерии завершения
- [Расширение](docs/extending.md) — добавить stage, тип проекта, схему
- [Эксплуатация](docs/operations.md) — запуск, мониторинг, дебаг, стоимость

---

## Стоимость

Полный pipeline на `claude-opus-4-6`: ~$0.75–$1.50 за run.
