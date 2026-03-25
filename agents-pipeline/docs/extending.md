# Extending the Pipeline

## Adding a New Stage

### 1. Добавить stage в реестр

В `pipeline/stages.yaml` → `stages:`:

```yaml
  - id: "11-social"
    name: "Social Media Strategy"
    role: "Social Media Strategist"
    description: "Создаёт стратегию контента для социальных сетей"
    contract: "pipeline/contracts/11-social.yaml"
    prompt: "prompts/11-social.md"
    review_required: false
    llm_required: true
    deterministic_parts:
      - "Загрузка page briefs и content"
```

### 2. Создать контракт

Файл `pipeline/contracts/11-social.yaml`:

```yaml
stage_id: "11-social"
name: "Social Media Strategy"
role: "Social Media Strategist"
goal: "Создать контент-план для социальных сетей"
inputs:
  - key: project_brief
    path: "stages/00-normalize/current/project-brief.yaml"
    required: true
    schema: "schemas/project-brief.schema.json"
  - key: content_index
    path: "stages/09-content-gen/current/content-index.md"
    required: true
    schema: null
outputs:
  - key: social_plan
    path: "stages/11-social/current/social-plan.md"
    schema: null
allowed_sources:
  - artifact
  - reasoning
review_required: false
completion_criteria:
  - "Контент-план для минимум 3 платформ"
  - "30 идей для постов"
risks:
  - "Тренды в соцсетях меняются быстро"
```

### 3. Создать промпт роли

Файл `prompts/11-social.md`:

```markdown
# Role: Social Media Strategist — Stage 11-social

## Role
Ты senior SMM-стратег...

## Input Artifacts
[стандартный формат]

## Task
[описание задачи]

## Output Format
[формат вывода]

## Completion Checklist
- [ ] Пункт 1
```

### 4. Добавить в project types (опционально)

В `pipeline/stages.yaml` → `project_types`:

```yaml
  - id: "local_business_website"
    required_stages: [..., "11-social"]
```

---

## Adding a New Project Type

В `pipeline/stages.yaml` → `project_types`:

```yaml
  - id: "ecommerce"
    name: "Интернет-магазин"
    required_stages:
      - "00-normalize"
      - "01-discovery"
      - "02-competitor"
      - "03-seo"
      - "04-ia"
      - "05-design"
      - "06-content-model"
      - "07-frontend"
      - "08-backend"
      - "09-content-gen"
      - "10-qa"
```

В коде `Pipeline.run_pipeline()` можно добавить фильтрацию по `project_type`.

---

## Modifying a Prompt

Промпты в `prompts/*.md` — это основной способ улучшить качество вывода.

**Лучшие практики:**

1. **Конкретность** — чем конкретнее инструкция, тем лучше результат
2. **Примеры** — покажи формат вывода на примере
3. **Constraints** — явно запрещай плохое поведение
4. **Completion Checklist** — помогает LLM самостоятельно проверить себя

**После изменения промпта:**
```bash
# Перезапустить stage с новым промптом
python scripts/run.py stage --run-id <id> --stage 01-discovery --rerun
```

---

## Adding a New Artifact Schema

В `schemas/my-artifact.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "my-artifact.schema.json",
  "title": "My Artifact",
  "type": "object",
  "required": ["field1", "field2"],
  "properties": {
    "field1": { "type": "string" },
    "field2": { "type": "array", "items": { "type": "string" } }
  }
}
```

Затем в контракте:
```yaml
outputs:
  - key: my_output
    path: "stages/XX-name/current/my-artifact.yaml"
    schema: "schemas/my-artifact.schema.json"
```

---

## Changing the LLM Model

В `pipeline/orchestrator.py`:
```python
DEFAULT_MODEL = "claude-sonnet-4-6"  # Дешевле, быстрее
```

Или передавать model в аргументах (будущее расширение).

---

## Adding Web Search Support

Текущая архитектура позволяет добавить web search для stages с `allowed_sources: [web_search]`.

В `_call_llm()` можно добавить tool use:

```python
tools = []
if "web_search" in contract.get("allowed_sources", []):
    tools.append({"type": "web_search_20260209", "name": "web_search"})
```

---

## Template Customization

Шаблоны артефактов в `templates/*.md` — это справочные документы, не используемые кодом напрямую. Они служат:
1. Образцом для LLM (промпты ссылаются на них)
2. Документацией ожидаемого формата вывода

Изменение шаблона само по себе не меняет поведение системы — нужно обновить и промпт.
