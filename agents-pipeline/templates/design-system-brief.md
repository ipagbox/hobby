# Design System Brief — [Project Name]

**Stage:** 05-design
**Date:** YYYY-MM-DD
**Strategist:** Brand & Design Agent

---

## Brand Identity

**Позиционирование:** [одно предложение]
**Ценности:** [3-5 ценностей]
**Архетип бренда:** [эксперт / заботливый / надёжный / ...]

---

## Tone of Voice

**Характеристики:**
- [характеристика 1]: [пример]
- [характеристика 2]: [пример]
- [характеристика 3]: [пример]

**Мы говорим:** [примеры правильных фраз]
**Мы не говорим:** [примеры запрещённых фраз]

---

## Color Palette

| Роль | HEX | RGB | Использование |
|------|-----|-----|--------------|
| Primary | #XXXXXX | rgb(X,X,X) | Основной цвет бренда, CTA кнопки |
| Secondary | #XXXXXX | rgb(X,X,X) | Акценты, заголовки |
| Accent | #XXXXXX | rgb(X,X,X) | Hover, highlights |
| Neutral Dark | #XXXXXX | rgb(X,X,X) | Основной текст |
| Neutral Mid | #XXXXXX | rgb(X,X,X) | Вторичный текст, иконки |
| Neutral Light | #XXXXXX | rgb(X,X,X) | Фоны секций |
| White | #FFFFFF | rgb(255,255,255) | Основной фон |
| Error | #XXXXXX | rgb(X,X,X) | Ошибки форм |
| Success | #XXXXXX | rgb(X,X,X) | Успешные действия |

---

## Typography

**Font Stack:**
```css
--font-heading: 'FontName', sans-serif;
--font-body: 'FontName', sans-serif;
```

**Type Scale:**
```css
--text-xs:   12px / 1.4;
--text-sm:   14px / 1.5;
--text-base: 16px / 1.6;
--text-lg:   18px / 1.5;
--text-xl:   24px / 1.3;
--text-2xl:  32px / 1.2;
--text-3xl:  48px / 1.1;
--text-4xl:  64px / 1.0;
```

**Usage:**
- H1: text-3xl / text-4xl, font-heading, bold
- H2: text-2xl, font-heading, semibold
- H3: text-xl, font-heading, medium
- Body: text-base, font-body, regular
- Small: text-sm, font-body, regular
- Caption: text-xs, font-body, regular

---

## Spacing & Layout

```css
--spacing-unit: 8px;
--container-max: 1200px;
--container-padding: 24px;  /* mobile: 16px */
--section-spacing: 80px;    /* mobile: 48px */
--grid-gap: 24px;
```

---

## Components

### Button — Primary
```
Background: Primary
Text: White
Border-radius: Xpx
Padding: 14px 28px
Font-size: text-base, semibold
Hover: Secondary (или Primary -10% lightness)
```

### Button — Secondary
```
Background: Transparent
Border: 2px solid Primary
Text: Primary
Hover: Primary bg, White text
```

### Card
```
Background: White
Border-radius: Xpx
Shadow: 0 2px 8px rgba(0,0,0,0.08)
Padding: 24px
Hover: Shadow увеличивается
```

### Form Input
```
Border: 1px solid Neutral Mid
Border-radius: Xpx
Padding: 12px 16px
Focus: Border Primary color
Error: Border Error color
```

### Hero Section
```
Min-height: 600px (mobile: 400px)
Background: [image / gradient / color]
Content alignment: [left / center]
Overlay: rgba(0,0,0,0.4) (если фото)
```

---

## Section Rules

| Тип секции | Фон | Отступ | Особенности |
|-----------|-----|--------|------------|
| Hero | Image/Dark | none | Всегда первый, H1 обязателен |
| Services | White | section-spacing | Grid 3 колонки (md: 2, sm: 1) |
| CTA Banner | Primary | section-spacing | Центрированный текст, 1-2 кнопки |
| Testimonials | Neutral Light | section-spacing | Carousel или grid |
| Contact Form | White | section-spacing | Form + контактная информация |
| Footer | Neutral Dark | section-spacing/2 | Многоколоночный |

---

## UX Principles

1. **Mobile-first:** все компоненты разрабатываются сначала для 375px
2. **CTA видимость:** главный CTA виден без скролла на любом экране
3. **Контактность:** телефон в header и footer, форма на главной
4. **Скорость:** изображения оптимизированы, никаких тяжёлых анимаций
5. **Доверие:** отзывы, сертификаты, фото команды — выше fold

---

## References

- Сайт 1: [URL] — [что взять за образец]
- Сайт 2: [URL] — [что взять за образец]

---

## Review Notes

> ⚠️ **Требует согласования с клиентом:**
> - [ ] Цветовая палитра
> - [ ] Шрифты (лицензии)
> - [ ] Tone of voice
> - [ ] Референсы
