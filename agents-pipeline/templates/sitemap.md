# Sitemap — [Project Name]

**Stage:** 04-ia
**Date:** YYYY-MM-DD
**Architect:** Information Architecture Agent

---

## Site Structure

```
/ (Главная)
├── /services/ (Услуги)
│   ├── /services/[slug]/ (Услуга 1)
│   ├── /services/[slug]/ (Услуга 2)
│   └── /services/[slug]/ (Услуга 3)
├── /about/ (О компании)
├── /portfolio/ (Портфолио / Примеры работ)
├── /reviews/ (Отзывы)
├── /blog/ (Блог / Статьи)
│   └── /blog/[slug]/ (Статья)
├── /contacts/ (Контакты)
└── /privacy/ (Политика конфиденциальности)
```

---

## Pages Registry

| # | URL | Название | Тип страницы | Keyword кластер | Приоритет |
|---|-----|---------|-------------|----------------|----------|
| 1 | / | Главная | homepage | | high |
| 2 | /services/ | Услуги | catalog | | high |
| 3 | /services/[slug]/ | [Услуга] | service-page | | high |
| 4 | /about/ | О компании | about | | medium |
| 5 | /portfolio/ | Портфолио | portfolio | | medium |
| 6 | /reviews/ | Отзывы | reviews | | medium |
| 7 | /contacts/ | Контакты | contacts | | high |
| 8 | /blog/[slug]/ | [Статья] | blog-post | | low |

---

## Navigation

### Main Menu
```
Главная | Услуги | Портфолио | Отзывы | О нас | Контакты
```

### Footer
```
Колонка 1: Навигация
Колонка 2: Услуги (ссылки на service pages)
Колонка 3: Контакты (адрес, телефон, email)
Копирайт | Политика конфиденциальности
```

---

## Internal Linking Strategy

- Главная → все service pages (через секцию услуг)
- Service pages → связанные услуги + контакты
- Блог-посты → релевантные service pages
- Все страницы → контакты (через CTA в header/footer)

---

## Breadcrumbs

- Главная > Услуги > [Название услуги]
- Главная > Блог > [Название статьи]

---

## URL Structure Rules

- Только строчные буквы
- Слова разделяются дефисом `-`
- Без trailing slash (или всегда с — главное консистентность)
- Транслитерация или английские ключевые слова (рекомендация: английские для SEO)

---

## Page Priority for Development

**Phase 1 (MVP):** Главная, 2-3 ключевые service pages, Контакты
**Phase 2:** Остальные service pages, О компании, Портфолио
**Phase 3:** Блог, Отзывы, дополнительные страницы
