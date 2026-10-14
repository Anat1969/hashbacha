# Betterment appraisal review rules (pinui-binui)

Source: the document "כללי בחינה והשוואה – שומות השבחה בפינוי בינוי". This file is the reference for the app logic.

## Purpose
Compare the developer appraiser's report (D) and the municipality appraiser's report (M) parameter by parameter against a neutral reference column (N) set by the reviewer, with a source for each value.

## Report structure (7 chapters, 22 parameters)
| code | chapter | parameter | unit | type | tolerance |
| --- | --- | --- | --- | --- | --- |
| r1 | זיהוי ומסגרת | מועד קובע | תאריך | match | exact |
| r2 | זיהוי ומסגרת | גישת שומה | טקסט | match | exact |
| r3 | זיהוי ומסגרת | שיעור היטל | % | num abs | 0 |
| r4 | מצב קודם | שטח בנוי קיים | מ"ר | num rel | ±2% |
| r5 | מצב קודם | שווי דירה קיימת | ₪/מ"ר | num rel | ±8% |
| r6 | מצב קודם | פוטנציאל תמ"א 38 / חלופה | מ"ר אקו' | num rel | ±30% |
| r7 | מצב קודם | שווי קרקע לפוטנציאל | ₪/מ"ר אקו' | num rel | ±15% |
| r8 | מצב חדש – זכויות | יח"ד בתכנית | יח"ד | num abs | 0 |
| r9 | מצב חדש – זכויות | שטח אקוויוולנטי כולל | מ"ר | num rel | ±3% |
| r10 | מצב חדש – זכויות | שטח דירת תמורה ממוצע | מ"ר | num rel | ±5% |
| r11 | מצב חדש – ערכים | מחיר מכירה דירה חדשה | ₪/מ"ר אקו' | num rel | ±7% |
| r12 | מצב חדש – ערכים | מספר עסקאות השוואה | עסקאות | min | at least N |
| r13 | עלויות | בנייה ישירה | ₪/מ"ר ברוטו | num rel | ±10% |
| r14 | עלויות | עלויות עקיפות | % מהישירות | num abs | ±4 pts |
| r15 | עלויות | שכר דירה לדיירים | חודשים | num abs | ±6 |
| r16 | עלויות | מטלות ציבוריות | ₪ מיליון | num rel | ±15% |
| r17 | עלויות | מימון | % מהעלויות | num abs | ±1.5 pts |
| r18 | עלויות | רווח יזמי | % | num abs | ±3 pts |
| r19 | מקדמים | תקופת דחייה עד מימוש | שנים | num abs | ±1 |
| r20 | מקדמים | שיעור היוון | % | num abs | ±1 pt |
| r21 | תוצאה | שווי מצב חדש | ₪ מיליון | num rel | ±10% |
| r22 | תוצאה | השבחה | ₪ מיליון | num rel | ±20% |

Derived levy = r22 × r3 / 100 (shown per column, not scored).

## Scoring
- deviation: rel = (v − N) / N ; abs = v − N
- in range when |deviation| ≤ tolerance (epsilon 1e-9)
- match: in range when equal to N (whitespace-normalized)
- min: in range when v ≥ N

Marking per row:
1. Both in range: the closer one green ("קרוב יותר"), the other red ("רחוק יותר"); equal distance: both green.
2. One in range: it is green ("בטווח"); the other red ("חריגה").
3. Both out of range: both red ("חריגה"); the closer one also labeled "קרובה יותר".
4. Missing value: grey "חסר". Missing N: grey "אין ייחוס".

Summary per side: number of green rows, number of exceedances. Review progress: approved / rejected / pending.

## Review process
1. Intake: import both reports in the fixed template. Missing chapters go back to the appraiser.
2. Calibration: reviewer sets N with a source for each parameter (or imports a "ייחוס" file).
3. Comparison: automatic marking.
4. Row review: reviewer marks ✓ / ✗ with a comment; date and reviewer saved.
5. Instructions letter: built from ✗ rows and sent to the developer and the developer's appraiser.

A red row is not automatically rejected: it needs an explanation from the appraiser. A row labeled "חריגה" needs a written justification or a correction.

## Import template (xlsx)
- First sheet. Meta rows: col A label, col B value: "סוג דוח" (יזם | עירייה | ייחוס), "שם הפרויקט", "מיקום", "תכנית משביחה", "שם השמאי", "תאריך השומה".
- Header row whose first cell is "קוד". Columns: קוד | פרק | פרמטר | יחידה | ערך | מקור / הסבר.
- Data rows: codes r1–r22. Numbers without ₪ or %. Percent as a number (25 = 25%). Millions for r16, r21, r22.
- Files: templates/template.xlsx (empty), templates/sample-developer.xlsx, templates/sample-municipality.xlsx, templates/sample-reference.xlsx (fictional data).

## Status flow
waiting_for_reports → reports_imported → in_review → instructions_sent → revised_report_received → approved

## Open items to verify
- Levy rate applying in Ashdod for pinui-binui (default 25%, council decision).
- Tolerance ranges to be calibrated with the committee appraiser and legal counsel.
