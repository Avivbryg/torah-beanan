# תורה שבענן

עלון ״פרשת השבוע למהנדסים״ כדף גמרא דיגיטלי. תוכנית העבודה ב-[PLAN.md](PLAN.md).

## הרצה מקומית

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # בונה לתיקייה dist
```

## הוספת עלון

שמים קובץ JSON חדש ב-`data/issues/` (הפורמט ב-PLAN.md), ומעלים ל-GitHub. Vercel בונה מחדש לבד.

## העלאה ל-Vercel

1. מעלים את התיקייה למאגר חדש ב-GitHub.
2. ב-Vercel: Add New → Project → בוחרים את המאגר. Vercel מזהה Vite לבד (Build: `npm run build`, Output: `dist`).
3. Deploy. מכאן כל push ל-main מעלה גרסה חדשה.
