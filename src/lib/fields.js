export const PROJECT_FIELDS = [
  { key: 'רובע', label: 'רובע', short: 'רובע' },
  { key: 'שם היזם', label: 'שם היזם', short: 'יזם' },
  { key: 'כתובת הפרויקט', label: 'כתובת הפרויקט', short: 'כתובת' },
  { key: "מס' תכנית/ מס זמני", label: 'מס׳ תכנית / מס׳ זמני', short: 'מס׳ תכנית' },
  { key: 'שם התכנית', label: 'שם התכנית', short: 'תכנית' },
  { key: 'סטטוס רמזור', label: 'סטטוס', short: 'סטטוס', type: 'status' },
  { key: 'קישור', label: 'קישור', short: 'קישור', type: 'url' }
];

export const OPINION_GROUPS = [
  { label: 'שמאים', keys: ['שמאי מטעם היזם', 'שמאי מטעם העירייה'] },
  { label: 'תאריכים', keys: ['תאריך קבלת בקשה', 'תאריך קבלת חוו"ד', 'דו"ח אחרון מעודכן'] },
  { label: 'יחידות', keys: ['מס יחידות קימיות', 'סה"כ יחידות בתכנית'] },
  { label: 'רווחיות', keys: ['רווחיות יזם (%)', 'רווחיות עירייה (%)', '__gap'] },
  { label: 'מעקב', keys: ['ממתין ל', 'הערות / סטטוס'] },
  { label: 'אחר', keys: ['מימוש', 'ת.ב.', 'שמאי לתבע'] }
];

export const OPINION_FIELDS = [
  { key: 'שמאי מטעם היזם', label: 'שמאי יזם' },
  { key: 'שמאי מטעם העירייה', label: 'שמאי עירייה' },
  { key: 'תאריך קבלת בקשה', label: 'תאריך בקשה', placeholder: 'DD/MM/YYYY', type: 'date' },
  { key: 'תאריך קבלת חוו"ד', label: 'תאריך חוו״ד', placeholder: 'DD/MM/YYYY', type: 'date' },
  { key: 'דו"ח אחרון מעודכן', label: 'דו״ח מעודכן', placeholder: 'DD/MM/YYYY', type: 'date' },
  { key: 'מס יחידות קימיות', label: 'יח׳ קיימות', type: 'num' },
  { key: 'סה"כ יחידות בתכנית', label: 'יח׳ בתכנית', type: 'num' },
  { key: 'רווחיות יזם (%)', label: 'רווחיות יזם', placeholder: '15.0%', type: 'pct' },
  { key: 'רווחיות עירייה (%)', label: 'רווחיות עירייה', placeholder: '15.0%', type: 'pct' },
  { key: 'ממתין ל', label: 'ממתין ל', type: 'follow' },
  { key: 'הערות / סטטוס', label: 'הערות / סטטוס', type: 'textarea' },
  { key: 'מימוש', label: 'מימוש' },
  { key: 'ת.ב.', label: 'ת.ב.' },
  { key: 'שמאי לתבע', label: 'שמאי לתבע' }
];

export const STATUS_OPTIONS = [
  { value: '', label: 'ללא', tone: 'none' },
  { value: 'הוגש', label: 'הוגש', tone: 'red' },
  { value: 'בטיפול', label: 'בטיפול', tone: 'amber' },
  { value: 'בוצע', label: 'בוצע', tone: 'green' }
];

export const EXCEL_HEADERS = [
  '#', 'רובע', 'שם היזם', 'כתובת הפרויקט', "מס' תכנית/ מס זמני", 'שם התכנית', 'סטטוס רמזור', 'קישור',
  'שמאי מטעם היזם', 'שמאי מטעם העירייה', 'תאריך קבלת בקשה', 'תאריך קבלת חוו"ד', 'דו"ח אחרון מעודכן',
  'מס יחידות קימיות', 'סה"כ יחידות בתכנית', 'רווחיות יזם (%)', 'רווחיות עירייה (%)',
  'ממתין ל', 'הערות / סטטוס', 'מימוש', 'ת.ב.', 'שמאי לתבע'
];

export const NOTE_KINDS = [
  { value: 'todo', label: 'לעשות' },
  { value: 'ask', label: 'לבקש' },
  { value: 'remember', label: 'לזכור' },
  { value: 'note', label: 'לתיק' }
];

export const CONTACT_ROLES = ['שמאי עירייה', 'שמאי יזם', 'יזם', 'אגף תכנון', 'אחר'];
