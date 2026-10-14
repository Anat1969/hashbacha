import { MAIL, findEmail } from './mail.js';
import { missingReportFields } from './calc.js';

// Builders for the MailComposer: each returns { build(picked) => draft, ...contact hints }.
const roleOf = (who) => (who === 'שמאי העירייה' ? 'שמאי עירייה' : who === 'שמאי היזם' ? 'שמאי יזם' : who === 'היזם' ? 'יזם' : 'אחר');

export function newProjectRequest(p, settings) {
  return { build: () => MAIL.newProject(p, settings) };
}

export function opinionReadyRequest(p, settings, opinion) {
  return { build: () => MAIL.opinionReady(p, settings, opinion) };
}

export function reminderRequest(p, follow, settings) {
  const contacts = settings.contacts || [];
  return {
    build: () => MAIL.reminder(p, follow, contacts),
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
    picked: missingReportFields(opinion),
    contactName: name || null,
    contactRole: appraiser ? 'שמאי יזם' : 'יזם',
    knownEmail: !!findEmail(contacts, name)
  };
}
