# התקדמות: מודול בקרת שומות השבחה

## 2026-10-14: תוכנית
- נבנה: מיפוי האפליקציה ותוכנית המודול, אושרו ונשמרו ב־`docs/hashbacha/plan.md`. סקיל UI/UX Pro Max מוזג (PR #8).
- קבצים: `docs/hashbacha/plan.md`, `docs/hashbacha/progress.md`.
- נשאר: שלבים 1 עד 7 בתוכנית. לפני שלב 1 נדרשת תשובה לשאלה הפתוחה הראשונה (מי מקבל קוד בודק וקוד צופה). שאלות 2 עד 4 נדרשות לפני שלבים 5 ו־7.

## 2026-10-14: שלבים 1 עד 6 (בסיס פעיל)
- **תיקון ייצור:** הענף `main` (שממנו Vercel מפרסם) הכיל את דף ההשוואה הנפרד במקום האפליקציה. מוזג אליו ענף ברירת המחדל (PR #10), והאפליקציה המלאה חזרה.
- **מסד נתונים (ASHDODMAP):**
  - תפקידים: עמודת `role` ב־`hb_access_keys` (editor / reviewer / viewer).
  - פונקציות הרשאה: `hb_role`, `hb_guard_read`, `hb_guard_write`. `hb_guard` דורש עכשיו editor.
  - טבלאות: `hb_reviews`, `hb_review_marks`, `hb_review_events`, `hb_review_files`.
  - פונקציות: `hb_review_open`, `_get`, `_file`, `_import`, `_set_ref`, `_mark`, `_status`, `_new_round`, `_approve`.
  - `hb_load` מחזיר את `me.role` ואת `reviews`.
- **לוגיקה:**
  - `src/lib/review/rules.js`, `score.js`, `parse.js`, הועתקו מדף הייחוס.
  - `tests/review-logic.mjs`: 17 בדיקות על שלושת קובצי הדוגמה ועל ארבעת מקרי הסימון.
- **ממשק:**
  - ברשימת הפרויקטים: עמודת "בקרת שומה", כפתור "בקרת שומת השבחה", קיבוץ לפי סטטוס בקרה, וסינון "שומות בבדיקה".
  - בכרטיס הפרויקט: לשוניות "פרויקט ומעקב" / "שומות השבחה", בנתיבים `#/p/:id/r` ו־`#/p/:id/r/:reviewId`.
  - עמוד ההשוואה: קליטת D/M/N, טבלה בשבעה פרקים, ✓/✗ עם הערה, עריכת ייחוס, סיכום והיטל נגזר.
  - מכתב הוראות דרך `MailComposer`, עם "סימון: המכתב נשלח".
  - סבב חדש, אישור (רק כשכל 22 השורות ✓), ויומן בקרה.
- **קבצים:**
  - `src/components/review/{ReviewTab,ReviewPage,ReviewPill}.jsx`
  - `src/App.jsx`, `src/lib/api.js`, `src/lib/mailRequests.js`
  - `src/components/{ProjectsView,ProjectDetail,MailComposer}.jsx`, `src/styles.css`
  - `tests/e2e.mjs` (140 בדיקות)
- **נשאר:**
  - קודי "בודק" ו"צופה": לא נוצרו. אין עדיין תשובה מי מקבל אותם.
  - הצעה לעדכן את רווחיות חוות הדעת לפי r18 אחרי אישור.
  - הורדת תבנית ריקה מתוך האפליקציה.
  - שאלות פתוחות 2 עד 4 בתוכנית.
