# Operations Guide — Agents Pipeline

## Prerequisites

```bash
# Python 3.10+
python --version

# Установить зависимости
cd agents-pipeline/
pip install -r requirements.txt

# Установить ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

## Quick Start: полный цикл за 10 минут

```bash
cd agents-pipeline/

# 1. Дать бриф
cat examples/plumbing-moscow/brief.yaml

# 2. Инициализировать run
python scripts/run.py init --brief examples/plumbing-moscow/brief.yaml
# → Run ID: santehnika-moskva-20260325-abc123

# 3. Запустить полный pipeline
python scripts/run.py pipeline --run-id santehnika-moskva-20260325-abc123

# 4. Посмотреть статус
python scripts/run.py status --run-id santehnika-moskva-20260325-abc123

# 5. Посмотреть артефакты
ls runs/santehnika-moskva-20260325-abc123/stages/
```

---

## Giving a Brief (как дать бриф)

### Минимальный бриф

```yaml
business:
  name: "Название компании"
  type: "Тип бизнеса"
```

### Стандартный бриф

```yaml
project_type: "local_business_website"
business:
  name: "Сантехника Мастер"
  type: "Сантехнические услуги"
  city: "Москва"
  district: "ЮЗАО"
  description: "Монтаж, ремонт, замена сантехники. Выезд по всей Москве."
goals:
  primary: "Генерация заявок"
  secondary: "Доверие через портфолио"
constraints:
  budget: "low"      # low | medium | high
  timeline: "2 weeks"
  tech: "static site preferred"
notes: "Нужна форма обратного звонка"
```

### Что происходит дальше

Система сама:
1. Нормализует бриф → `project-brief.yaml`
2. Строит гипотезы о рынке → `discovery-report.md`
3. Анализирует конкурентов → `competitor-analysis.md`
4. Создаёт keyword map → `keyword-map.md`
5. Проектирует структуру сайта → `sitemap.md`
6. Создаёт дизайн-бриф → `design-system-brief.md`
7. Пишет page briefs → `page-briefs.md`
8. Реализует frontend → `src/*.html`
9. Настраивает backend → `backend-plan.md`
10. Генерирует контент → `pages/*.md`
11. Проводит QA аудит → `final-report.md`

---

## Running Stages

### Полный pipeline

```bash
python scripts/run.py pipeline --run-id <id>
```

### Только одна stage

```bash
python scripts/run.py stage --run-id <id> --stage 01-discovery
```

### Повторный запуск stage (сохраняет историю)

```bash
python scripts/run.py stage --run-id <id> --stage 01-discovery --rerun
```

Создаёт новую версию `v2/`. Симлинк `current` обновляется. Предыдущая версия `v1/` сохраняется.

### Запуск диапазона stages

```bash
# Только исследование и SEO
python scripts/run.py pipeline --run-id <id> --from-stage 01-discovery --to-stage 03-seo

# Только фронтенд и далее
python scripts/run.py pipeline --run-id <id> --from-stage 07-frontend
```

### Dry run (без LLM, только промпт)

```bash
python scripts/run.py stage --run-id <id> --stage 01-discovery --dry-run
# → Сохраняет промпт в stages/01-discovery/v1/_dry_run_prompt.md
```

---

## Input/Output Files

### Как понять что stage завершена корректно

1. **Статус** — `completed` в `run-metadata.yaml`
2. **Файл существует** — артефакт присутствует в `stages/{id}/current/`
3. **Артефакт в индексе** — запись в `artifact-index.yaml`
4. **Валидация** — `python scripts/validate.py --run-id <id> --stage <id>`

### Основные входные файлы

| Файл | Для кого |
|------|---------|
| `brief.yaml` | Все stages (через project-brief.yaml) |
| `stages/00-normalize/current/project-brief.yaml` | Stages 01+ |
| `stages/01-discovery/current/discovery-report.md` | Stages 02, 03, 05 |
| `stages/03-seo/current/keyword-map.md` | Stages 04, 06, 09 |
| `stages/04-ia/current/sitemap.md` | Stages 05, 06, 07 |
| `stages/05-design/current/design-system-brief.md` | Stages 06, 07, 09 |
| `stages/06-content-model/current/page-briefs.md` | Stages 07, 08, 09 |

### Основные выходные файлы

| Stage | Артефакты |
|-------|----------|
| 00-normalize | `project-brief.yaml` |
| 01-discovery | `discovery-report.md` |
| 02-competitor | `competitor-analysis.md` |
| 03-seo | `keyword-map.md` |
| 04-ia | `sitemap.md`, `page-types.md` |
| 05-design | `design-system-brief.md` |
| 06-content-model | `content-model.md`, `page-briefs.md` |
| 07-frontend | `frontend-plan.md`, `src/*.html, *.css, *.js` |
| 08-backend | `backend-plan.md` |
| 09-content-gen | `content-index.md`, `pages/*.md` |
| 10-qa | `launch-checklist.md`, `seo-audit.md`, `final-report.md` |

---

## Stages with review_required

Три stages требуют ручной проверки перед продолжением:

| Stage | Почему |
|-------|--------|
| `02-competitor` | Данные о конкурентах могут быть устаревшими |
| `05-design` | Дизайн-бриф нужно согласовать с клиентом |
| `10-qa` | Финальный отчёт — точка принятия решения |

При достижении такой stage pipeline останавливается со статусом `review_required`.

**Как продолжить:**
1. Проверить/исправить артефакт вручную
2. Запустить следующую stage явно: `python scripts/run.py stage --run-id <id> --stage 03-seo`
3. Или продолжить pipeline: `python scripts/run.py pipeline --run-id <id> --from-stage 03-seo`

---

## Validation

```bash
# Валидировать все артефакты run
python scripts/validate.py --run-id <id>

# Валидировать одну stage
python scripts/validate.py --run-id <id> --stage 00-normalize

# Валидировать входной бриф
python scripts/validate.py --brief examples/plumbing-moscow/brief.yaml
```

**Статусы:**
- ✅ VALID — артефакт валиден по схеме
- ❌ INVALID — не прошёл валидацию (с сообщением об ошибке)
- 🔵 NO SCHEMA — схема не определена (markdown-файлы), проверка не применяется

---

## Troubleshooting

### "Required input not found"

```
❌ Error: Required input 'project_brief' not found at: .../stages/00-normalize/current/project-brief.yaml
  → Run the preceding stage first.
```

**Решение:** Запустить stage `00-normalize` перед `01-discovery`.

### "ANTHROPIC_API_KEY not set"

```
❌ Unexpected error: ANTHROPIC_API_KEY environment variable not set
```

**Решение:** `export ANTHROPIC_API_KEY="sk-ant-..."`

### "anthropic package not installed"

```bash
pip install anthropic
```

### Stage вернула некачественный артефакт

1. Просмотреть промпт: `cat runs/<id>/stages/<stage-id>/v1/_dry_run_prompt.md`
2. Улучшить промпт в `prompts/<stage-id>.md`
3. Перезапустить: `python scripts/run.py stage --run-id <id> --stage <stage-id> --rerun`

---

## Environment Variables

| Переменная | Обязательная | Описание |
|-----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Да | API ключ Anthropic |

---

## Cost Estimation

Примерные затраты на полный pipeline (`claude-opus-4-6`):
- Вход: ~50,000-100,000 tokens ($0.25–$0.50)
- Выход: ~20,000-40,000 tokens ($0.50–$1.00)
- **Итого на run: ~$0.75–$1.50**

Для снижения стоимости используйте `--from-stage` / `--to-stage` для запуска только нужных stages.
