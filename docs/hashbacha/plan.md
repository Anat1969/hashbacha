# מודול בקרת שומות השבחה: מיפוי האפליקציה ותוכנית

## מה קודם
למזג קודם את PR #8 (סקיל UI/UX Pro Max). הוא קבצי סקיל בלבד, בלי קוד אפליקציה, ואינו חוסם דבר. מיזוגו לפני הבנייה מבטיח שהסקיל יהיה זמין בשיחת הבנייה. לכן: לאשר תוכנית זו, למזג את #8, ואז לבנות לפי השלבים.

## Context
המודול מוסיף לכל פרויקט פינוי־בינוי בדיקה שיטתית של שתי השומות: של שמאי היזם (D) ושל שמאי העירייה (M). כל אחד מ־22 הפרמטרים מושווה לעמודת ייחוס ניטרלית (N) לפי rules.md. הבודק מסמן ✓ או ✗ בכל שורה, ושורות ✗ הופכות למכתב הוראות לשמאי היזם וליזם. היום זה דף HTML נפרד (`docs/hashbacha/reference/index.html`) שעובד על אחסון אחר ולא מקושר לפרויקטים. המטרה: לשלב אותו באפליקציה הקיימת, על אותו מאגר, אותה הרשאה ואותה שפה עיצובית. מקור הלוגיקה: `rules.md` ופונקציות `assess`, `compare` ו־`parseReport` בדף הייחוס. העיצוב מגיע מהאפליקציה בלבד.

## החלטות שהתקבלו
- הרשאות: שני תפקידים בקודים, "בודק" (כתיבה) ו"צופה" (קריאה בלבד).
- דוח מתוקן פותח סבב חדש. הסבב הקודם נשמר. סימונים של שורות שלא השתנו עוברים לסבב החדש.
- אישור סופי ידני, ורק כשכל השורות מסומנות ✓.
- כל בדיקה מקושרת לחוות דעת ספציפית בפרויקט.

---

## 1. מיפוי האפליקציה הקיימת

| נושא | איך זה עובד היום | קבצים |
| --- | --- | --- |
| שמירת פרויקטים | `hb_projects` (data jsonb, position, deleted_at), `hb_opinions` (project_id, data jsonb), `hb_notes` (kind, meta jsonb), `hb_settings` (אנשי קשר, מיילים), `hb_activity` (יומן). מחיקה רכה. | Supabase ASHDODMAP |
| גישה לנתונים | רק דרך פונקציות `hb_*` (SECURITY DEFINER) עם `hb_guard(p_key)`. `hb_load` מחזיר את כל המאגר בקריאה אחת, ו־`ctx.mutate` רץ, טוען מחדש ומציג הודעה. | `src/lib/api.js`, `src/App.jsx` |
| אימות ותפקידים | קוד משותף, שמור כ־sha256 ב־`hb_access_keys`. `hb_admins` לפי email (לא בשימוש בממשק). אין תפקידים: כל קוד כותב. | `hb_allowed`, `hb_guard` |
| ניתוב | hash: `#/` רשימה, `#/p/:id` כרטיס, `#/a`, `#/a/:tab`, `#/log`. | `parseRoute` ב־`src/App.jsx` |
| אחסון קבצים | אין. Excel נקרא בדפדפן (`import('xlsx')` עצל) ולא נשמר. | `src/lib/excel.js` |
| רכיבי ממשק משותפים | `Modal`, `Field`, `StatusPill`, `ProfitMeter`, `Toasts`, `ease` | `src/components/ui.jsx` |
|  | `ConfirmDialog` דרך `ctx.confirm` | `ConfirmDialog.jsx` |
|  | `SortHeader`, `ProfitPair`, `FollowBadge` | `ProjectsView.jsx` |
|  | `BenchmarkLegend`, `GapLegend` (מקרא עם קו ייחוס) | `Legend.jsx` |
|  | `NoteComposer`, `NoteList`, `isMail`, `noteDate` | `Notes.jsx` |
|  | `MailComposer`, דרך `ctx.openMail(request)`, מתייק `mail_out` אוטומטית | `MailComposer.jsx`, `src/lib/mailRequests.js` |
|  | `MailLog` (תיוק מייל נכנס בהדבקה) | `MailLog.jsx` |
| מחלקות CSS | `panel`, `panel-head`, `panel-actions`, `table-wrap`, `table`, `row`, `row-edit`, `th-btn`, `td-sorted`, `pill pill-*`, `chip-btn`, `seg-control`, `btn` (`primary`/`ghost`/`quiet`/`sm`), `facts`/`fact`, `opinion-card`, `form-grid`, `form-group`, `file-timeline`/`ft-*`, `empty`, `state-card`, `hint`, `label`, `display-l`/`display-s`, `editbar`, `focus-bar`, `insight-grid`, `summary`, `tile` | `src/styles.css` |
| טוקנים | `:root`: `--ink`…`--ink-4`, `--paper`, `--line`, `--green` (הצלחה), `--red` (סכנה), `--amber`, `--shadow-1..3`, `--radius`, `--font`, `--mono` | `src/styles.css` |
| RTL | `<html lang="he" dir="rtl">`, מאפייני CSS לוגיים (`inset-inline`, `padding-inline`), `bdi dir="ltr"` למספרים עם סימן, `reverse` בציר X של הגרפים, טבלאות הופכות לכרטיסים מתחת ל־860px | `index.html`, `src/styles.css` |
| המסך הקרוב ביותר לטבלת נתונים עם פעולות | טבלת הפרויקטים ב־`ProjectsView`: כותרות מיון, פעולות בשורה, עריכה בשורה, שורות קבוצה, כרטיסים בנייד. בכרטיס הפרויקט: `OpinionCard`/`OpinionForm`. | `ProjectsView.jsx`, `ProjectDetail.jsx` |
| בדיקות | Playwright מול `vite preview`, עם mock בזיכרון לכל `rpc`. כל כפתור נבדק לפי ה־payload שהוא שולח. | `tests/e2e.mjs` |

---

## 2. מסד נתונים והרשאות

**תפקידים**: עמודה `role text default 'editor'` ב־`hb_access_keys`, עם הערכים `editor`, `reviewer`, `viewer`.
- הקוד הקיים נשאר `editor` (גישה מלאה).
- `hb_role(p_key)` מחזיר את התפקיד, ו־`hb_load` מחזיר אותו כ־`me.role`.
- `hb_guard_write(p_key, need)`: פעולות הבדיקה (סימון, הודעה, אישור) דורשות `reviewer` או `editor`. `viewer` חסום בכל כתיבה, גם במודולים הקיימים.

**טבלאות חדשות** (כולן `hb_`, RLS פעיל, אין גישה ישירה, הכול דרך RPC, מחיקה רכה):

| טבלה | עמודות עיקריות |
| --- | --- |
| `hb_reviews` | id, project_id → hb_projects, opinion_id → hb_opinions (nullable), round int, status, levy_rate, params jsonb (22 שורות: N, src, D, M, הערות D/M, מקורות), created_at, approved_at, approved_by, deleted_at. ייחודי ל־(project_id, opinion_id, round). |
| `hb_review_marks` | review_id, row_code (r1–r22), verdict (`ok`/`no`/null), comment, reviewer, marked_at, carried_from (סבב קודם). PK (review_id, row_code). |
| `hb_review_events` | id, review_id, at, actor, kind (import/mark/status/letter_draft/letter_sent/round_open/approve), detail jsonb. כל אירוע נרשם גם כשורה מקוצרת ב־`hb_activity`, כדי שיופיע ביומן הקיים. |
| `hb_review_files` | id, review_id, slot (D/M/N), file_name, size, sha256, content_b64 (עד 2MB), meta jsonb (שם השמאי, תאריך השומה), uploaded_at, uploaded_by. |

**למה הקבצים בטבלה ולא ב־Storage**: מדיניות של Storage בודקת JWT, וההרשאה כאן היא קוד ולא משתמש מחובר. קבצי ה־xlsx קטנים (כ־9KB), ושמירתם דרך RPC שומרת על מודל הרשאה אחד.

**פונקציות RPC** (באותו דפוס כמו היום):
- `hb_review_open(key, project, opinion)`: יוצר בדיקה או מחזיר את הקיימת.
- `hb_review_import(key, review, slot, file, parsed)`
- `hb_review_set_ref(key, review, row, N, src)`
- `hb_review_mark(key, review, row, verdict, comment, reviewer)`
- `hb_review_status(key, review, status, note)`
- `hb_review_new_round(key, review)`
- `hb_review_approve(key, review)`: נכשל אם יש שורה שאינה ✓.
- `hb_review_file(key, file_id)`: הורדה.

`hb_load` מחזיר גם `reviews` בסיכום (מזהה, סבב, סטטוס, מונים). הפרטים המלאים נטענים ב־`hb_review_get(key, review)` רק בכניסה לעמוד ההשוואה, כדי לא להכביד על הטעינה הראשית.

---

## 3. מסכים, ורכיבים קיימים שישמשו בכל אחד

### א. רשימת הפרויקטים: תג סטטוס וכפתור
- עמודה חדשה "שומה" שמציגה את סטטוס הבדיקה האחרונה. `StatusPill` מורחב במיפוי סטטוסים חדש עם אותם גוונים: `pill-none` (ממתין לדוחות), `pill-amber` (בבדיקה, הוראות נשלחו), `pill-green` (אושר), `pill-red` (התקבל דוח מתוקן, ממתין לבדיקה).
- בפעולות השורה: כפתור `btn btn-sm btn-ghost` "בקרת שומת השבחה", לצד "פתח", "ערוך" ו"מחק".
- קיבוץ וסינון: אפשרות "סטטוס שומה" ב־`GROUPS`, וכפתור סינון מהיר `chip-btn` בשם "שומות בבדיקה".
- **רכיבים**: `SortHeader`, `StatusPill`, `row-actions`, `GROUPS`/`CHIPS` הקיימים.

### ב. כרטיס הפרויקט: לשונית "שומות השבחה"
- `seg-control` בראש הכרטיס עם שתי לשוניות: "פרויקט ומעקב" (התוכן הקיים) ו"שומות השבחה". זה אותו דפוס כמו `file-tabs`.
- בלשונית החדשה רשימת בדיקות לפי חוות דעת. כל שורה היא `opinion-card` מקוצר: מספר חוו"ד, סבב, `StatusPill`, מונים ✓/✗/ממתין, וכפתור "פתיחת ההשוואה".
- חוות דעת בלי בדיקה: כפתור "פתיחת בדיקה לחוות דעת זו".
- **רכיבים**: `seg-control`, `opinion-card`, `opinion-head`, `StatusPill`, `empty`, `btn`.
- נתיב: `#/p/:id/r` לרשימה, `#/p/:id/r/:reviewId` להשוואה. הרחבה של `parseRoute` הקיים.

### ג. עמוד ההשוואה `#/p/:id/r/:reviewId`
- **כותרת**: `back`, `detail-hero` (שם הפרויקט, חוו"ד, סבב), `StatusPill`, ובורר סבבים `seg-control` כשיש יותר מסבב אחד.
- **שלוש משבצות קליטה** (יזם / עירייה / ייחוס): כרטיסי `mail-card` (אותו כרטיס־כפתור), כל אחד עם שם הקובץ, שם השמאי, תאריך השומה ו"החלפת קובץ".
  - הקליטה משתמשת ב־`import('xlsx')` כמו `src/lib/excel.js`, וב־`parseReport` מועבר לקובץ לוגיקה.
  - אם הקובץ סותר את המשבצת (למשל "סוג דוח: עירייה" במשבצת יזם): `ctx.confirm`.
  - הערות הקליטה (ערך חסר, בלי מקור, שם פרויקט שונה) מוצגות ב־`panel` עם רשימה, באותו סגנון של `hint`/`insights`.
- **מקרא**: הרחבה של `Legend.jsx` לווריאנט "קרוב יותר / רחוק יותר / חריגה / חסר / אין ייחוס", בצבעים `--green`, `--red` ו־`--ink-4`.
- **טבלת ההשוואה**: `table-wrap` ו־`table`, שורות קבוצה (`group-row`) לפי 7 פרקים, וכרטיסים בנייד.
  - עמודות: קוד, פרמטר, יחידה, טווח סבילות, ייחוס N + מקור (עריכה בשורה בדפוס `row-edit` עם `input-cell`), שמאי יזם, שמאי עירייה, בקרה.
  - תא של צד: הערך, תווית (`pill-green` / `pill-red` / `pill-none`), סטייה מהייחוס, וסרגל מיקום בטווח בדפוס `meter`/`pair-track` עם `pair-mark` במרכז.
  - עמודת בקרה: שני כפתורי `btn-sm` (✓ אישור, ✗ דחייה) עם `aria-pressed`, `textarea` להערה, ושורת "עודכן dd/mm/yyyy · שם הבודק" ב־`label`. אצל `viewer` הכפתורים מושבתים.
- **סיכום**: `insight-grid`/`summary`/`tile`.
  - לכל צד: מספר שורות ירוקות ומספר חריגות.
  - התקדמות הבדיקה: אושרו / נדחו / ממתינים.
  - היטל נגזר (r22 × r3 / 100) לכל עמודה, בלי ניקוד.
- **פעולות**: "מכתב הוראות" (פעיל כשיש ✗), "סבב חדש" (אחרי שהמכתב נשלח), "אישור הבדיקה" (פעיל רק כשכל השורות ✓, עם `ctx.confirm`).
- **רכיבים**: `table`, `group-row`, `row-edit`, `input-cell`, `pill`, `meter`, `pair-mark`, `Field`, `ctx.confirm`, `ctx.toast`, `editbar` (לשמירת שינויי ייחוס), `mail-card`, `insight-grid`, `summary`, `state-card`.

### ד. מסך מכתב הוראות
- `Modal wide`, באותו דפוס כמו `MailComposer`.
- **בונה**: `reviewLetterRequest(review, project, settings)` חדש ב־`src/lib/mailRequests.js`.
  - הטיוטה כוללת את כל שורות ✗: פרק, פרמטר, ערך השמאי, ערך הייחוס ומקורו, סטייה, תווית (חריגה / רחוק יותר) והערת הבודק.
  - שורה עם "חריגה" נוסחה כ"נדרש נימוק כתוב או תיקון", לפי rules.md.
  - נמענים: שמאי היזם והיזם, דרך `findEmail` ואנשי הקשר הקיימים.
- **שליחה**: דרך `MailComposer` הקיים, עם Gmail, Outlook, תוכנת דואר והעתקה. המייל מתויק אוטומטית כ־`mail_out` בתיק הפרויקט, כמו היום.
- **סימון כנשלח**: אחרי הפתיחה מוצג בתוך הדיאלוג כפתור "סימון כנשלח". הוא מעביר את הסטטוס ל־`instructions_sent` ורושם אירוע `letter_sent` עם תאריך, נמענים ומספר שורות. פתיחה בלבד רושמת `letter_draft`, כי לא בטוח שהמייל נשלח בפועל.
- **רכיבים**: `MailComposer`, `ctx.openMail`, `mailRequests`, `findEmail`, `check`, `pick` (הסרה של שורות ✗ מסוימות מהמכתב, אותו דפוס כמו "השלמת פרטים").

### ה. יומן הבדיקה
- בעמוד ההשוואה, `panel` עם `file-timeline` ו־`ft-legend`, שמציג את `hb_review_events` מהחדש לישן.
- האירועים מופיעים גם ב"ציר זמן מלא" בכרטיס הפרויקט ו"ביומן", דרך `hb_activity`.
- **רכיבים**: `FileTimeline` (ייצוא מתוך `ProjectDetail.jsx` לרכיב משותף), `ft-legend`, `ft-key`.

---

## 4. זרימת סטטוס (rules.md)

| סטטוס | תווית | מעבר |
| --- | --- | --- |
| `waiting_for_reports` | ממתין לדוחות | בפתיחת בדיקה |
| `reports_imported` | הדוחות נקלטו | אוטומטי, כששתי המשבצות D ו־M מלאות |
| `in_review` | בבדיקה | אוטומטי, בסימון הראשון של ✓/✗ |
| `instructions_sent` | הוראות נשלחו | ידני, "סימון כנשלח" |
| `revised_report_received` | התקבל דוח מתוקן | אוטומטי, קליטת D או M בסבב חדש. הסבב הקודם ננעל לקריאה. |
| `approved` | אושר | ידני, רק כשכל 22 השורות ✓ |

אחרי `revised_report_received` הסימון הבא מחזיר ל־`in_review`. כל מעבר נרשם ב־`hb_review_events`. מעבר לא חוקי נחסם בשרת (`hb_review_status`).

**סבב חדש**: מעתיק את N ואת המקורות. סימון של שורה שערך D/M שלה לא השתנה עובר עם `carried_from`. שורה שהשתנתה חוזרת ל"ממתין".

**עדכון חוות הדעת לאחר אישור**: הצעה לעדכן את "רווחיות יזם (%)" ו"רווחיות עירייה (%)" בחוות הדעת המקושרת לפי r18 של D ו־M. זה כפתור עם `ctx.confirm`, לא פעולה אוטומטית.

---

## 5. קבצים

**חדשים**
- `src/lib/review/rules.js`: 22 הפרמטרים, הפרקים והסטטוסים.
- `src/lib/review/score.js`: `assess`, `compare`, `summary`, `levy`. פונקציות טהורות מתוך הייחוס.
- `src/lib/review/parse.js`: `parseReport`.
- `src/components/review/ReviewList.jsx`, `ReviewPage.jsx`, `ReviewRow.jsx`, `ReviewLetter.jsx`.

**שינויים**
- `src/App.jsx`: נתיבים ו־`me.role` ב־`ctx`.
- `src/lib/api.js`: פונקציות review.
- `ProjectsView.jsx`: עמודה, כפתור, קיבוץ.
- `ProjectDetail.jsx`: לשוניות, וייצוא `FileTimeline`.
- `ui.jsx`: מיפוי סטטוסים ב־`StatusPill`.
- `Legend.jsx`: מקרא בדיקה.
- `mailRequests.js`: מכתב הוראות.
- `styles.css`: רק מה שאין לו מקבילה. צפוי: תא צד ותא בקרה, כהרכבה של מחלקות קיימות.
- `tests/e2e.mjs`: mock ובדיקות.

**תיעוד**: `docs/hashbacha/plan.md` (התוכנית הזו), ו־`docs/hashbacha/progress.md` מתעדכן בסוף כל שלב, לפי CLAUDE.md.

## 6. סדר בנייה (כל שלב נבדק, נדחף ומתועד ב־progress.md)
1. מסד נתונים, תפקידים ו־RPC, עם בדיקה כ־anon: קוד צופה נחסם בכתיבה.
2. לוגיקה: rules, score ו־parse, עם בדיקות יחידה על שלושת קובצי הדוגמה.
3. לשונית בכרטיס הפרויקט ורשימת בדיקות.
4. עמוד השוואה: קליטה, ייחוס, סימון ✓/✗ וסיכום.
5. מכתב הוראות, יומן וזרימת סטטוס.
6. תג וכפתור ברשימת הפרויקטים, קיבוץ וסינון.
7. סבבים, ואישור עם עדכון חוות הדעת.

## הנחות
- הסבילויות וברירת מחדל של שיעור היטל 25% קבועות בקוד לפי rules.md, עם עקיפה לכל בדיקה (`levy_rate`). אין עדיין מסך לעריכת הסבילויות.
- "שם הבודק" נלקח מהשם שנשמר בדפדפן (`hashbacha-author`, כמו בהערות). אם הוא ריק, נשאל פעם אחת.
- קובץ ייחוס (N) אינו חובה: אפשר להזין N ידנית לכל שורה עם מקור.
- קבצים עד 2MB בטבלה, ונשמרת רק הגרסה האחרונה לכל משבצת בכל סבב.
- המכתב נשלח מתיבת הדואר של המשתמשת. האפליקציה לא שולחת מיילים בעצמה.
- נתוני הדוגמה הבדויים לא נטענים למאגר האמיתי. הם משמשים רק לבדיקות.

## שאלות פתוחות
1. מי מקבל קוד "בודק" וקוד "צופה"? (ענת, אילנית, שמאי הוועדה?) לכל קוד ייווצר קישור כניסה נפרד.
2. האם שמאי העירייה (M) מקבל מכתב הוראות משלו על שורות ✗ בצד שלו, או שהמכתב מיועד רק לצד היזם, כמו ב־rules.md?
3. שיעור ההיטל באשדוד (פריט פתוח ב־rules.md): להשאיר 25% עד לאישור?
4. האם לאפשר בדיקה ברמת פרויקט בלי חוות דעת, כשעדיין אין רשומת חוו"ד?

## Verification
- `npm run build && npm test`:
  - קליטת שלושת הקבצים מ־`docs/hashbacha/templates`, והשוואת הסימון לכללי rules.md בכל אחד מ־4 המקרים.
  - payload של כל כפתור.
  - `viewer` חסום.
  - אין גלילה אופקית ב־390px.
- בדיקה כ־anon מול Supabase: קוד שגוי וקוד צופה נחסמים בכתיבה, `hb_review_approve` נכשל כשיש שורה פתוחה.
- צילומי מסך: השוואה ויזואלית מול המסכים הקיימים (טבלת פרויקטים, כרטיס חוו"ד), כדי לוודא שאין סגנון חדש.
- פריסה ל־production ידנית (Vercel), ואימות READY.
