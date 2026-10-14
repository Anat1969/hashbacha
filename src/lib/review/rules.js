// The 22 review parameters, chapters and status flow (docs/hashbacha/rules.md).
export const CHAPTERS = ['זיהוי ומסגרת', 'מצב קודם', 'מצב חדש – זכויות', 'מצב חדש – ערכים', 'עלויות', 'מקדמים', 'תוצאה'];

// [code, chapter, label, unit, type (num | match | min), tolType (rel | abs), tol]
export const PARAMS = [
  ['r1', 0, 'מועד קובע', 'תאריך', 'match', 'abs', 0],
  ['r2', 0, 'גישת שומה', 'טקסט', 'match', 'abs', 0],
  ['r3', 0, 'שיעור היטל', '%', 'num', 'abs', 0],
  ['r4', 1, 'שטח בנוי קיים', 'מ"ר', 'num', 'rel', 0.02],
  ['r5', 1, 'שווי דירה קיימת', '₪/מ"ר', 'num', 'rel', 0.08],
  ['r6', 1, 'פוטנציאל תמ"א 38 / חלופה', "מ\"ר אקו'", 'num', 'rel', 0.30],
  ['r7', 1, 'שווי קרקע לפוטנציאל', "₪/מ\"ר אקו'", 'num', 'rel', 0.15],
  ['r8', 2, 'יח"ד בתכנית', 'יח"ד', 'num', 'abs', 0],
  ['r9', 2, 'שטח אקוויוולנטי כולל', 'מ"ר', 'num', 'rel', 0.03],
  ['r10', 2, 'שטח דירת תמורה ממוצע', 'מ"ר', 'num', 'rel', 0.05],
  ['r11', 3, 'מחיר מכירה דירה חדשה', "₪/מ\"ר אקו'", 'num', 'rel', 0.07],
  ['r12', 3, 'מספר עסקאות השוואה', 'עסקאות', 'min', 'abs', 0],
  ['r13', 4, 'בנייה ישירה', '₪/מ"ר ברוטו', 'num', 'rel', 0.10],
  ['r14', 4, 'עלויות עקיפות', '% מהישירות', 'num', 'abs', 4],
  ['r15', 4, 'שכר דירה לדיירים', 'חודשים', 'num', 'abs', 6],
  ['r16', 4, 'מטלות ציבוריות', '₪ מיליון', 'num', 'rel', 0.15],
  ['r17', 4, 'מימון', '% מהעלויות', 'num', 'abs', 1.5],
  ['r18', 4, 'רווח יזמי', '%', 'num', 'abs', 3],
  ['r19', 5, 'תקופת דחייה עד מימוש', 'שנים', 'num', 'abs', 1],
  ['r20', 5, 'שיעור היוון', '%', 'num', 'abs', 1],
  ['r21', 6, 'שווי מצב חדש', '₪ מיליון', 'num', 'rel', 0.10],
  ['r22', 6, 'השבחה', '₪ מיליון', 'num', 'rel', 0.20]
].map(([id, ch, label, unit, type, tolType, tol]) => ({ id, ch, label, unit, type, tolType, tol }));

export const SLOTS = { D: 'שמאי היזם', M: 'שמאי העירייה', N: 'ייחוס' };
export const KIND = { 'יזם': 'D', 'עירייה': 'M', 'ייחוס': 'N' };

// Tones reuse the app's pill classes: none / amber / red / green.
export const REVIEW_STATUS = {
  waiting_for_reports: { label: 'ממתין לדוחות', tone: 'none' },
  reports_imported: { label: 'הדוחות נקלטו', tone: 'amber' },
  in_review: { label: 'בבדיקה', tone: 'amber' },
  instructions_sent: { label: 'הוראות נשלחו', tone: 'amber' },
  revised_report_received: { label: 'התקבל דוח מתוקן', tone: 'red' },
  approved: { label: 'אושר', tone: 'green' }
};
