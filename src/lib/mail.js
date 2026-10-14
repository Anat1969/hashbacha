function body(p, lines) {
  return [
    'שלום,', '', ...lines, '',
    `שם היזם: ${p['שם היזם'] || ''}`,
    `כתובת הפרויקט: ${p['כתובת הפרויקט'] || ''}`,
    `מספר תכנית: ${p["מס' תכנית/ מס זמני"] || ''}`,
    `שם התכנית: ${p['שם התכנית'] || ''}`,
    `קישור: ${p['קישור'] || ''}`
  ].join('\n');
}

export function newProjectMail(p, to) {
  return {
    to: to || '',
    subject: 'נוסף פרויקט חדש ונדרשת חוות דעת',
    text: body(p, ['נוסף פרויקט חדש ונדרשת חוות דעת.']) + '\n\nנא להפנות לשמאי מוסמך לקבלת חוות דעת מטעם העירייה.'
  };
}

export function opinionReadyMail(p, to) {
  return {
    to: to || '',
    subject: 'קיימת חוות דעת מטעם העירייה',
    text: body(p, ['עודכנה חוות דעת מטעם העירייה עבור הפרויקט.'])
  };
}

export function mailtoHref({ to, subject, text }) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
