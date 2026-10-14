import { formatDuration, missingReportFields } from './calc.js';

function projectBlock(p) {
  return [
    `שם התכנית: ${p['שם התכנית'] || '—'}`,
    `שם היזם: ${p['שם היזם'] || '—'}`,
    `כתובת הפרויקט: ${p['כתובת הפרויקט'] || '—'}`,
    `מספר תכנית: ${p["מס' תכנית/ מס זמני"] || '—'}`,
    ...(p['קישור'] ? [`קישור: ${p['קישור']}`] : [])
  ].join('\n');
}

const greet = (name) => (name ? `שלום ${name},` : 'שלום,');

export function findEmail(contacts, name) {
  if (!name) return '';
  const n = name.trim();
  const hit = (contacts || []).find((c) => c.email && (c.name.trim() === n || n.includes(c.name.trim()) || c.name.trim().includes(n)));
  return hit ? hit.email : '';
}

// Each template returns an editable draft: { kind, title, to, subject, text }.
export const MAIL = {
  newProject(p, settings) {
    return {
      kind: 'newProject',
      title: 'פרויקט חדש: בקשה לשיבוץ שמאי',
      to: settings.ilanitEmail || '',
      subject: `נדרשת חוות דעת שמאית: ${p['שם התכנית'] || p['שם היזם'] || 'פרויקט חדש'}`,
      text: [
        greet('אילנית'), '',
        'נוסף פרויקט חדש למעקב ונדרשת חוות דעת שמאית מטעם העירייה.', '',
        projectBlock(p), '',
        'אודה לשיבוץ שמאי מטעם העירייה ולעדכון לגבי מועד משוער לחוות הדעת.', '',
        'תודה,'
      ].join('\n')
    };
  },

  opinionReady(p, settings, opinion) {
    const dev = opinion?.['רווחיות יזם (%)'];
    const city = opinion?.['רווחיות עירייה (%)'];
    return {
      kind: 'opinionReady',
      title: 'עדכון אגף תכנון: התקבלה חוות דעת',
      to: settings.planningEmail || '',
      subject: `התקבלה חוות דעת שמאית: ${p['שם התכנית'] || p['שם היזם'] || ''}`,
      text: [
        greet(), '',
        'התקבלה חוות דעת שמאית מטעם העירייה עבור הפרויקט שלהלן.', '',
        projectBlock(p), '',
        ...(opinion ? [
          `שמאי עירייה: ${opinion['שמאי מטעם העירייה'] || '—'}`,
          `תאריך חוות הדעת: ${opinion['תאריך קבלת חוו"ד'] || '—'}`,
          `רווחיות לפי דוח היזם: ${dev || '—'} · רווחיות לפי שמאי העירייה: ${city || '—'}`, ''
        ] : []),
        'חוות הדעת מצורפת לתיק הפרויקט וזמינה להמשך הטיפול.', '',
        'תודה,'
      ].join('\n')
    };
  },

  reminder(p, follow, contacts) {
    const role = follow.who;
    return {
      kind: 'reminder',
      title: `תזכורת ל${role}`,
      to: findEmail(contacts, follow.name),
      subject: `תזכורת: חוות דעת ממתינה · ${p['שם התכנית'] || p['שם היזם'] || ''}`,
      text: [
        greet(follow.name), '',
        `הבקשה בפרויקט שלהלן הועברה ב־${follow.opinion['תאריך קבלת בקשה']} וממתינה ${formatDuration(follow.days)}.`,
        role === 'היזם'
          ? 'הטיפול ממתין לעדכון מצדכם. אודה להעברת החומרים המעודכנים.'
          : 'אודה לעדכון לגבי מצב הבדיקה ומועד משוער להשלמת חוות הדעת.', '',
        projectBlock(p), '',
        'תודה,'
      ].join('\n')
    };
  },

  missingDetails(p, opinion, contacts, picked) {
    const missing = picked || missingReportFields(opinion);
    const appraiser = (opinion?.['שמאי מטעם היזם'] || '').trim();
    const developer = (p['שם היזם'] || '').trim();
    const to = [findEmail(contacts, appraiser), findEmail(contacts, developer)].filter(Boolean).join(', ');
    return {
      kind: 'missingDetails',
      title: 'השלמת פרטים חסרים בדוח הכלכלי',
      to,
      subject: `השלמת פרטים לדוח הכלכלי · ${p['שם התכנית'] || developer}`,
      text: [
        greet([appraiser, developer].filter(Boolean).join(' ו')), '',
        'לצורך השלמת הבדיקה השמאית מטעם העירייה, חסרים בדוח הכלכלי שהוגש הפרטים הבאים:', '',
        ...missing.map((m, i) => `${i + 1}. ${m.label}`), '',
        projectBlock(p), '',
        'אודה להשלמת הפרטים בהקדם, כדי שנוכל להמשיך בטיפול.', '',
        'תודה,'
      ].join('\n')
    };
  }
};

export function gmailHref({ to, subject, text }) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export function outlookHref({ to, subject, text }) {
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export function mailtoHref({ to, subject, text }) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

// Longest compose link each service accepts. Hebrew letters encode to six characters each, and Outlook
// re-encodes the link through the Microsoft sign-in page (AADSTS90015), so long letters cannot travel in the URL.
export const LINK_LIMIT = { gmail: 6000, outlook: 1500, mailto: 1800 };
export const PASTE_LINE = 'הנוסח המלא הועתק. הדביקו כאן: Ctrl+V';
const BUILD = { gmail: gmailHref, outlook: outlookHref, mailto: mailtoHref };

// { href, trimmed }: trimmed = the body did not fit, so it goes through the clipboard instead.
export function composeHref(service, draft) {
  const full = BUILD[service](draft);
  if (full.length <= LINK_LIMIT[service]) return { href: full, trimmed: false };
  return { href: BUILD[service]({ ...draft, text: PASTE_LINE }), trimmed: true };
}
