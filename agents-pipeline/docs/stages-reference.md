# Stages Reference — Agents Pipeline

Справочник по всем stages в порядке выполнения.

---

## 00-normalize — Project Brief Normalization

**Роль:** Project Analyst
**LLM:** да | **Review required:** нет

**Что делает:** Преобразует сырой бриф в структурированный `project-brief.yaml`.
Заполняет пробелы через разумные допущения, явно помечает их в `assumptions[]`.

**Входы:** `brief.yaml`
**Выходы:** `project-brief.yaml` (по схеме `schemas/project-brief.schema.json`)

**Критерии завершения:**
- Все обязательные поля заполнены
- `project_type` определён
- `assumptions[]` содержит все допущения
- `tech_stack_recommendation` задан

---

## 01-discovery — Discovery / Market Research

**Роль:** Market Research Analyst
**LLM:** да | **Review required:** нет

**Что делает:** Строит гипотезы о ЦА, сегментах, болях, офферах и контексте рынка.

**Входы:** `project-brief.yaml`
**Выходы:** `discovery-report.md`

**Критерии завершения:**
- Минимум 2 сегмента ЦА с конкретными болями
- Перечень услуг с ценностью для клиента
- Каналы привлечения
- 3-5 гипотез для проверки с клиентом

---

## 02-competitor — Competitor Analysis ⚠️ Review Required

**Роль:** Competitive Intelligence Analyst
**LLM:** да | **Review required:** ДА

**Что делает:** Анализирует конкурентное поле, типы игроков, позиционирование, gaps.

**Входы:** `project-brief.yaml`, `discovery-report.md`
**Выходы:** `competitor-analysis.md`

**Почему нужен review:** Данные о конкурентах могут быть устаревшими или основаны на общих паттернах а не конкретных локальных компаниях.

---

## 03-seo — SEO / Keyword Clustering

**Роль:** SEO Strategist
**LLM:** да | **Review required:** нет

**Что делает:** Создаёт keyword clusters, привязывает их к страницам, даёт мета-рекомендации.

**Входы:** `project-brief.yaml`, `discovery-report.md`, `competitor-analysis.md` (опц.)
**Выходы:** `keyword-map.md`

**Важно:** Объёмы запросов — оценочные (high/medium/low). Для точных данных нужен Ahrefs/SEMrush.

---

## 04-ia — Information Architecture / Sitemap

**Роль:** Information Architect
**LLM:** да | **Review required:** нет

**Что делает:** Строит структуру сайта, URL иерархию, навигацию, типы страниц.

**Входы:** `project-brief.yaml`, `discovery-report.md`, `keyword-map.md`
**Выходы:** `sitemap.md`, `page-types.md`

**Критерии:** Каждый keyword cluster покрыт страницей. URL структура согласована с SEO.

---

## 05-design — Brand Platform / Design System Brief ⚠️ Review Required

**Роль:** Brand & Design Strategist
**LLM:** да | **Review required:** ДА

**Что делает:** Создаёт практичный дизайн-бриф с HEX-кодами, CSS переменными, компонентами.

**Входы:** `project-brief.yaml`, `discovery-report.md`, `sitemap.md`, `competitor-analysis.md` (опц.)
**Выходы:** `design-system-brief.md`

**Почему нужен review:** Дизайн нужно согласовать с клиентом до начала верстки.

---

## 06-content-model — Content Model / Page Briefs

**Роль:** Content Strategist
**LLM:** да | **Review required:** нет

**Что делает:** Создаёт модель контента и детальный бриф для каждой страницы.

**Входы:** `project-brief.yaml`, `sitemap.md`, `page-types.md`, `keyword-map.md`, `design-system-brief.md` (опц.)
**Выходы:** `content-model.md`, `page-briefs.md`

**Критерии:** Каждая страница из sitemap имеет page brief с H1, title, description, секциями, CTA.

---

## 07-frontend — Frontend Implementation

**Роль:** Frontend Engineer
**LLM:** да | **Review required:** нет

**Что делает:** Реализует HTML/CSS/JS на основе дизайн-брифа и page briefs.

**Входы:** `project-brief.yaml`, `design-system-brief.md`, `sitemap.md`, `page-briefs.md`
**Выходы:** `frontend-plan.md`, `src/` директория

**Важно:** LLM может генерировать неполный или нерабочий код. Требуется проверка в браузере.

---

## 08-backend — Backend / CMS / Lead Capture

**Роль:** Backend Engineer
**LLM:** да | **Review required:** нет

**Что делает:** Проектирует и реализует форму захвата лидов, email-уведомления.

**Входы:** `project-brief.yaml`, `frontend-plan.md`, `page-briefs.md`
**Выходы:** `backend-plan.md`, `src/` код

**Стратегия выбирается автоматически** по `constraints.budget`:
- low → Formspree/Web3Forms (бесплатно)
- medium → Netlify Functions
- high → Full backend

---

## 09-content-gen — Content Generation

**Роль:** Content Writer
**LLM:** да | **Review required:** нет

**Что делает:** Генерирует реальный контент для каждой страницы на основе keyword clusters и page briefs.

**Входы:** `project-brief.yaml`, `page-briefs.md`, `keyword-map.md`, `design-system-brief.md` (опц.)
**Выходы:** `content-index.md`, `pages/*.md`

**Важно:** Контент требует финальной вычитки. LLM использует плейсхолдеры `[ТЕЛЕФОН]`, `[ЦЕНА]` для данных которые нужно уточнить.

---

## 10-qa — QA / SEO Audit / Final Report ⚠️ Review Required

**Роль:** QA & SEO Auditor
**LLM:** да | **Review required:** ДА

**Что делает:** Проверяет полноту и связность всех артефактов. Создаёт launch checklist и финальный отчёт.

**Входы:** Все предыдущие артефакты
**Выходы:** `launch-checklist.md`, `seo-audit.md`, `final-report.md`

**Почему нужен review:** Финальный отчёт — точка принятия решения о запуске. QA без реального браузера неполный.

---

## Stage Status Reference

| Статус | Значение |
|--------|---------|
| `pending` | Ожидает запуска |
| `in_progress` | Выполняется |
| `completed` | Успешно завершена |
| `failed` | Ошибка |
| `review_required` | Завершена, требует ручной проверки |
| `skipped` | Пропущена (не нужна для данного project_type) |
