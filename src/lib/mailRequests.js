import { MAIL, findEmail } from './mail.js';
import { missingReportFields } from './calc.js';

// Builders for the MailComposer: each returns { build(picked) => draft, ...contact hints }.
const roleOf = (who) => (who === 'שמאי העירייה' ? 'שמאי עירייה' : who === 'שמאי היזם' ? 'שמאי יזם' : who === 'היזם' ? 'יזם' : 'אחר');

export function newProjectRequest(p, settings) {
  return { build: () => MAIL.newProject(p, settings), projectId: p._id };
}

export function opinionReadyRequest(p, settings, opinion) {
  return { build: () => MAIL.opinionReady(p, settings, opinion), projectId: p._id };
}

export function reminderRequest(p, follow, settings) {
  const contacts = settings.contacts || [];
  return {
    build: () => MAIL.reminder(p, follow, contacts),
    projectId: p._id,
    contactName: follow.name || null,
    contactRole: roleOf(follow.who),
    knownEmail: !!findEmail(contacts, follow.name)
  };
}

export function missingDetailsRequest(p, opinion, settings) {
  const contacts = settings.contacts || [];
  const appraiser = (opinion?.['שמאי מטעם היזם'] || '').trim();
  const name = appraiser || (p['שם היזם'] || '').trim();
  return {
    build: (picked) => MAIL.missingDetails(p, opinion, contacts, picked),
    projectId: p._id,
    picked: missingReportFields(opinion),
    contactName: name || null,
    contactRole: appraiser ? 'שמאי יזם' : 'יזם',
    knownEmail: !!findEmail(contacts, name)
  };
}

// Instructions letter: every ✗ row of a review, addressed to the developer's appraiser and the developer.
export function reviewLetterRequest({ p, opinion, review, rows, settings, onSent }) {
  const contacts = settings.contacts || [];
  const appraiser = (opinion?.['שמאי מטעם היזם'] || '').trim();
  const developer = (p['שם היזם'] || '').trim();
  const to = [findEmail(contacts, appraiser), findEmail(contacts, developer)].filter(Boolean).join(', ');
  const name = p['שם התכנית'] || developer || 'הפרויקט';
  return {
    projectId: p._id,
    contactName: appraiser || developer || null,
    contactRole: appraiser ? 'שמאי יזם' : 'יזם',
    knownEmail: !!to,
    onSent,
    build: () => ({
      kind: 'reviewLetter',
      title: 'מכתב הוראות לשמאי היזם וליזם',
      to,
      subject: `בקרת שומת השבחה: הוראות לתיקון · ${name}${review.round > 1 ? ` · סבב ${review.round}` : ''}`,
      text: [
        `שלום ${[appraiser, developer].filter(Boolean).join(' ו') || ''}`.trim() + ',', '',
        `בבדיקת שומת ההשבחה שהוגשה לפרויקט ${name}${opinion ? ` (חוות דעת מיום ${opinion['תאריך קבלת בקשה'] || '—'})` : ''} נמצאו ${rows.length} פרמטרים שדורשים תיקון או הסבר.`,
        'כל פרמטר הושווה לעמודת ייחוס נייטרלית עם מקור לכל ערך, לפי כללי הבחינה של אגף השבחה.', '',
        ...rows.map((x, i) => [
          `${i + 1}. ${x.chapter} · ${x.label} (${x.unit})`,
          `   בדוח: ${x.value} · ערך ייחוס: ${x.ref}${x.src ? ` (מקור: ${x.src})` : ''}`,
          `   ${x.deviation ? x.deviation + ' · ' : ''}טווח קביל: ${x.tol}`,
          `   ${x.exceed ? 'חריגה מהטווח: נדרש נימוק כתוב או תיקון.' : 'נדרש הסבר או תיקון.'}`,
          ...(x.comment ? [`   הערת הבודק: ${x.comment}`] : [])
        ].join('\n')), '',
        'אבקש להגיש דוח מתוקן בתבנית האחידה, עם מקור או הסבר לכל ערך שתוקן.', '',
        'תודה,'
      ].join('\n')
    })
  };
}
