import React, { createContext, useContext, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ease } from './ui.jsx';
import { CHAPTERS, PARAMS, REVIEW_STATUS } from '../lib/review/rules.js';
import { PROFIT_THRESHOLD } from '../lib/config.js';

const SECTIONS = [
  ['vision', 'חזון ומטרה'],
  ['flow', 'המסלול'],
  ['io', 'קלט ופלט'],
  ['logic', 'הלוגיקה'],
  ['comm', 'תקשורת'],
  ['roles', 'מי עושה מה'],
  ['connect', 'איך הכול מתחבר'],
  ['start', 'צעדים ראשונים']
];

const FLOW = [
  ['פרויקט נכנס למאגר', 'עורכת מוסיפה פרויקט ב"פרויקטים", או מייבאת רשימה מאקסל. לכל פרויקט: רובע, יזם, כתובת, מספר תכנית וסטטוס.'],
  ['בקשה לחוות דעת', 'נרשמת חוות דעת עם תאריך הבקשה, שמאי היזם ושמאי העירייה. מייל מוכן לאילנית לשיבוץ שמאי.'],
  ['מעקב', 'המערכת מראה אצל מי הבקשה ("ממתין ל") ומזה כמה זמן. תזכורת נשלחת בלחיצה, מנוסחת מראש.'],
  ['בקרת שומה', 'קולטים את דוח שמאי היזם ואת דוח שמאי העירייה, קובעים ערך ייחוס עם מקור, ומסמנים ✓ או ✗ בכל אחד מ־22 הפרמטרים.'],
  ['מכתב הוראות', 'שורות ✗ הופכות למכתב לשמאי היזם וליזם. דוח מתוקן פותח סבב חדש, והסבב הקודם נשמר.'],
  ['אישור וניתוח', 'כשכל השורות ✓ הבקרה מאושרת. הרווחיות מתעדכנת בחוות הדעת ונכנסת לגרפים בלשונית "ניתוח".']
];

const INPUTS = [
  ['פרטי פרויקט', 'מוקלדים בטופס או מיובאים מאקסל.'],
  ['חוות דעת', 'תאריכי בקשה וקבלה, שמאים, רווחיות יזם ועירייה, הערות. כל הערה מתויגת בתאריך.'],
  ['דוחות שמאים', 'קובצי אקסל בתבנית האחידה: יזם, עירייה וייחוס. 22 פרמטרים, לכל ערך מקור.'],
  ['ערכי ייחוס', 'הבודקת קובעת ערך נייטרלי ומקור לכל פרמטר, מקובץ או ידנית.'],
  ['סימוני בקרה', '✓ או ✗ לכל שורה, עם הערה. נשמרים שם הבודקת והתאריך.'],
  ['מיילים נכנסים', 'מדביקים מייל שהתקבל. המערכת מזהה שולח ופרויקט ומתייקת.'],
  ['הערות ומשימות', 'ביומן או בתיק הפרויקט: משימה, בקשה, לזכור, הערה.']
];

const OUTPUTS = [
  ['רשימת פרויקטים', 'סטטוס, גורם מעקב ומשך המתנה, רווחיות של שני הצדדים מול הבנצ׳מרק, סטטוס בקרה.'],
  ['תיק פרויקט', 'ציר זמן אחד: בקשות, חוות דעת, הערות, מיילים יוצאים ונכנסים ואירועי בקרה.'],
  ['טבלת השוואה', 'כל פרמטר: יזם, ייחוס ועירייה. ירוק קרוב או בטווח, אדום רחוק או חריגה, אפור חסר.'],
  ['סיכום בקרה', 'לכל צד: כמה קרובים לייחוס וכמה חריגות. היטל נגזר לכל עמודה.'],
  ['מכתב הוראות', 'מנוסח מכל שורות ✗: ערך, ייחוס ומקור, סטייה, טווח והערת הבודקת.'],
  ['טיוטות מייל', 'לאילנית, לאגף תכנון, תזכורת לגורם המעקב, השלמת פרטים חסרים.'],
  ['ניתוח', 'גרפים של רווחיות, פערי יזם מול עירייה וזמני טיפול, עם קיבוץ ומיקוד.'],
  ['ייצוא', 'כל המאגר לאקסל, וקובצי הדוחות המקוריים להורדה מכל בקרה.']
];

const MARKING = [
  ['שני השמאים בטווח', 'הקרוב יותר לייחוס ירוק ("קרוב יותר"), השני אדום ("רחוק יותר"). מרחק שווה: שניהם ירוקים.'],
  ['רק אחד בטווח', 'הוא ירוק ("בטווח"), השני אדום ("חריגה").'],
  ['שניהם מחוץ לטווח', 'שניהם אדומים ("חריגה"). הקרוב יותר מסומן גם "קרובה יותר".'],
  ['ערך חסר', 'אפור: "חסר" כשאין ערך, "אין ייחוס" כשלא נקבע ייחוס.']
];

const ROLES = [
  ['ענת שטיבלמן', 'אדריכלית העיר', 'עריכה ובדיקה', 'מנהלת את המאגר והקודים, עורכת פרויקטים וחוות דעת, מאשרת בקרות.'],
  ['אילנית זוהר', 'מנהלת אגף השבחה', 'בודקת', 'קולטת דוחות, קובעת ייחוס, מסמנת ✓ / ✗, שולחת מכתבי הוראות ומאשרת בקרה.'],
  ['צוות העירייה', 'כל השאר', 'צפייה', 'רואים את כל הנתונים, הבקרות והניתוח. לא משנים דבר.'],
  ['שמאי היזם', 'גורם חיצוני', 'ללא כניסה', 'מגיש דוח בתבנית האחידה, מקבל מכתב הוראות ומגיש דוח מתוקן.'],
  ['היזם', 'גורם חיצוני', 'ללא כניסה', 'מקבל העתק של מכתב ההוראות ובקשות להשלמת פרטים.'],
  ['שמאי העירייה', 'מטעם הוועדה', 'ללא כניסה', 'מגיש חוות דעת ודוח בתבנית האחידה.'],
  ['אגף תכנון', 'גורם עירוני', 'ללא כניסה', 'מקבל עדכון כשמתקבלת חוות דעת.']
];

const GLOSSARY = [
  ['עמודת ייחוס', 'ערך נייטרלי שהבודקת קובעת לכל פרמטר, עם מקור. מולו נמדדים שני השמאים.'],
  ['טווח קביל', 'הסטייה המותרת מהייחוס: באחוזים (למשל ±8%), ביחידות (±6 חודשים), זהות מלאה או סף מינימום.'],
  ['חריגה', 'ערך מחוץ לטווח. דורשת נימוק כתוב או תיקון. שורה אדומה אינה דחייה אוטומטית.'],
  ['סבב', 'גרסה של הבקרה. דוח מתוקן פותח סבב חדש, וסימונים של שורות שלא השתנו עוברים אליו.'],
  ['גורם מעקב', 'אצל מי הבקשה: שמאי העירייה, שמאי היזם, היזם או העירייה. כשלא נקבע, מוסק מההערות ומסומן "משוער".'],
  ['בנצ׳מרק', `רווחיות יזמית של ${PROFIT_THRESHOLD}%. מתחת: ירוק. מעל: אדום, דורש בחינה.`],
  ['היטל נגזר', 'השבחה × שיעור היטל ÷ 100, בכל עמודה. מוצג לצורך השוואה ואינו חלק מהציון.']
];

// One chapter at a time: the chapter bar stays put and only the text below it changes.
const TabContext = createContext('vision');
const tabHref = (id) => `#/guide/${id}`;

function Section({ id, label, title, children }) {
  const cur = useContext(TabContext);
  if (cur !== id) return null;
  const i = SECTIONS.findIndex(([x]) => x === id);
  const prev = SECTIONS[i - 1]; const next = SECTIONS[i + 1];
  return (
    <motion.section id={`guide-${id}`} role="tabpanel" className="panel guide-section" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
      <div className="panel-head">
        <div>
          <span className="label">פרק {String(i + 1).padStart(2, '0')} מתוך {String(SECTIONS.length).padStart(2, '0')} · {label}</span>
          <h2 className="display-s">{title}</h2>
        </div>
      </div>
      {children}
      <div className="guide-pager">
        {prev ? <a className="btn btn-ghost" href={tabHref(prev[0])}>לפרק הקודם: {prev[1]}</a> : <span />}
        {next && <a className="btn btn-ghost" href={tabHref(next[0])}>לפרק הבא: {next[1]}</a>}
      </div>
    </motion.section>
  );
}

export default function Guide({ standalone = false, tab }) {
  const cur = SECTIONS.some(([id]) => id === tab) ? tab : SECTIONS[0][0];
  // The chapter bar sticks just under the app header, whose height changes with screen width.
  const [stickTop, setStickTop] = useState(standalone ? 12 : 76);
  useEffect(() => {
    if (standalone) return undefined;
    const measure = () => { const h = document.querySelector('.topbar')?.getBoundingClientRect().height; if (h) setStickTop(Math.round(h) + 6); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [standalone]);
  const statusFlow = ['waiting_for_reports', 'reports_imported', 'in_review', 'instructions_sent', 'revised_report_received', 'approved'];
  return (
    <div className={`page guide${standalone ? ' guide-standalone' : ''}`}>
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">מדריך למשתמש · אגף השבחה, עיריית אשדוד</span>
          <h1 className="display-l">השבחה<br /><span className="thin">איך זה עובד, ממי למי ולמה</span></h1>
          <p className="lead">
            אפליקציה אחת שמרכזת את כל פרויקטי הפינוי־בינוי בעיר: הבקשות, חוות הדעת השמאיות, ההתכתבות ובקרת השומות.
            המדריך מסביר מה נכנס, מה יוצא, מי עושה מה ואיך הכול מתחבר.
          </p>
          {standalone && <a className="btn btn-primary guide-enter" href="#/">לכניסה לאפליקציה</a>}
        </div>
      </section>

      <nav className="seg-control guide-tabs" role="tablist" aria-label="פרקי המדריך" style={{ top: stickTop }}>
        {SECTIONS.map(([id, l], i) => (
          <a key={id} role="tab" aria-selected={cur === id} className={cur === id ? 'on' : ''} href={tabHref(id)}>
            <span className="mono">{String(i + 1).padStart(2, '0')}</span> {l}
          </a>
        ))}
      </nav>

      <TabContext.Provider value={cur}>

      <Section id="vision" label="למה האפליקציה קיימת" title="חזון ומטרה">
        <div className="insight-grid">
          <div className="guide-card">
            <span className="label">חזון</span>
            <p className="guide-big">כל החלטה על היטל השבחה בפינוי־בינוי נשענת על נתונים גלויים, ניתנים להשוואה ומתועדים, ולא על זיכרון או קבצים מפוזרים.</p>
          </div>
          <div className="guide-card">
            <span className="label">מטרה</span>
            <p className="guide-big">לקצר את זמן הטיפול בחוות דעת, לדעת בכל רגע אצל מי הכדור, ולבדוק כל שומה באותה שיטה: 22 פרמטרים מול עמודת ייחוס עם מקור.</p>
          </div>
        </div>
        <span className="label">איך יודעים שזה עובד</span>
        <ul className="insights">
          <li>זמן הטיפול החציוני בחוות דעת יורד, ורואים אותו בלשונית "פרויקטים" ובלשונית "ניתוח".</li>
          <li>אין בקשה פתוחה בלי גורם מעקב ובלי תאריך.</li>
          <li>כל שומה עוברת בקרה מתועדת: מי סימן, מתי, ולמה.</li>
          <li>כל מייל שיצא או נכנס מתויק בתיק הפרויקט.</li>
        </ul>
      </Section>

      <Section id="flow" label="מפרויקט חדש ועד אישור" title="המסלול בשישה צעדים">
        <ol className="guide-flow">
          {FLOW.map(([t, d], i) => (
            <li key={t} className="mail-card guide-step">
              <span className="opinion-num mono">{String(i + 1).padStart(2, '0')}</span>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="io" label="מה נכנס למערכת ומה יוצא ממנה" title="קלט ופלט">
        <div className="insight-grid">
          <div>
            <span className="label">קלט</span>
            <dl className="guide-list">{INPUTS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </div>
          <div>
            <span className="label">פלט</span>
            <dl className="guide-list">{OUTPUTS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </div>
        </div>
      </Section>

      <Section id="logic" label="לפי כללי הבחינה של אגף השבחה" title="הלוגיקה של בקרת השומה">
        <p className="lead guide-lead">
          כל שומה נבדקת ב־{PARAMS.length} פרמטרים ב־{CHAPTERS.length} פרקים. לכל פרמטר יש טווח קביל.
          שמאי היזם ושמאי העירייה נמדדים מול עמודת ייחוס נייטרלית, והצבע מראה מי קרוב יותר ומי חורג.
        </p>
        <div className="chips">{CHAPTERS.map((c, i) => <span key={c} className="pill pill-none">{i + 1}. {c} · {PARAMS.filter((r) => r.ch === i).length}</span>)}</div>
        <div className="table-wrap guide-table">
          <table className="table">
            <thead><tr><th>מצב</th><th>סימון</th></tr></thead>
            <tbody>{MARKING.map(([k, v]) => <tr key={k} className="row"><td data-label="מצב"><b>{k}</b></td><td data-label="סימון">{v}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="legend review-legend" role="note">
          <span className="legend-item"><i className="dot dot-green" />קרוב יותר לייחוס, או בטווח</span>
          <span className="legend-item"><i className="dot dot-red" />רחוק יותר, או חריגה</span>
          <span className="legend-item"><i className="dot dot-none" />חסר ערך או אין ייחוס</span>
        </div>
        <span className="label">מצבי הבקרה</span>
        <div className="chips guide-status">{statusFlow.map((s, i) => <span key={s} className={`pill pill-${REVIEW_STATUS[s].tone}`}>{i + 1}. {REVIEW_STATUS[s].label}</span>)}</div>
        <ul className="insights">
          <li>שורה אדומה אינה דחייה אוטומטית. היא דורשת הסבר מהשמאי, ו"חריגה" דורשת נימוק כתוב או תיקון.</li>
          <li>אישור סופי אפשרי רק כשכל 22 השורות מסומנות ✓. אחרי אישור הבקרה נעולה.</li>
          <li>דוח מתוקן פותח סבב חדש. שורה שהערך בה השתנה חוזרת לבדיקה, ושורה שלא השתנתה שומרת את הסימון.</li>
          <li>רווחיות: הבנצ׳מרק הוא {PROFIT_THRESHOLD}%. הצבע מסמן סיכון: ירוק מתחת לבנצ׳מרק, אדום מעליו. תמיד מוצגים שני הצדדים, יזם ועירייה.</li>
        </ul>
      </Section>

      <Section id="comm" label="מיילים, הערות ותיוק" title="איך מתבצעת התקשורת">
        <ol className="steps">
          <li><b>כל מייל נפתח קודם לעריכה באפליקציה.</b> הנמען ממולא מאנשי הקשר, והנוסח מוכן. אפשר לשנות כל מילה.</li>
          <li><b>שליחה דרך השירות שלך:</b> Gmail, Outlook, תוכנת הדואר במחשב, או העתקה. השליחה עצמה נעשית שם.</li>
          <li><b>מייל ארוך,</b> כמו מכתב הוראות, נפתח עם נמען ונושא בלבד. הנוסח המלא מועתק, ומדביקים אותו בגוף המייל (Ctrl+V).</li>
          <li><b>תיוק רק אחרי אישור:</b> חוזרים לאפליקציה ולוחצים "נשלח, לתייק". רק אז המייל נרשם בתיק, ובמכתב הוראות הבקרה עוברת ל"הוראות נשלחו".</li>
          <li><b>מייל שהתקבל:</b> בתיק הפרויקט, "תיוק מייל מתיבת הדואר", ומדביקים. המערכת מזהה את השולח ואת הפרויקט.</li>
          <li><b>הערות ומשימות:</b> כל הערה נשמרת עם תאריך ושם הכותב, ביומן או בתיק הפרויקט.</li>
        </ol>
        <p className="hint">אין חיבור ישיר לתיבת הדואר. האפליקציה לא שולחת מיילים בעצמה, וכך שום דבר לא יוצא בלי שתראי ותאשרי.</p>
      </Section>

      <Section id="roles" label="הרשאות לפי קוד כניסה" title="מי עושה מה">
        <div className="table-wrap guide-table">
          <table className="table">
            <thead><tr><th>מי</th><th>תפקיד</th><th>הרשאה</th><th>מה עושה</th></tr></thead>
            <tbody>
              {ROLES.map(([n, r, a, d]) => (
                <tr key={n} className="row">
                  <td data-label="מי"><span className="project-name">{n}</span></td>
                  <td data-label="תפקיד">{r}</td>
                  <td data-label="הרשאה"><span className={`pill ${a === 'ללא כניסה' ? 'pill-none' : a === 'צפייה' ? 'pill-none' : 'pill-green'}`}>{a}</span></td>
                  <td data-label="מה עושה">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">כל אחד נכנס בקישור אישי, והקוד שבקישור קובע את ההרשאה. בראש המסך מופיע "הרשאת בודק" או "צפייה בלבד" לפי הקוד.</p>
      </Section>

      <Section id="connect" label="המבנה שמאחורי המסכים" title="איך הכול מתחבר">
        <div className="insight-grid">
          <ul className="insights">
            <li><b>מאגר אחד מאובטח</b> מחזיק את הפרויקטים, חוות הדעת, הערות, מיילים מתויקים, בקרות וקובצי הדוחות. הגישה רק בקוד כניסה.</li>
            <li><b>הכול מקושר לפרויקט:</b> לכל פרויקט חוות דעת, ולכל חוות דעת בקרה עם סבבים. הערות ומיילים מתויקים לפרויקט, ואירועי הבקרה נכנסים לציר הזמן שלו וליומן.</li>
            <li><b>שינוי אחד, בכל המקומות:</b> סימון בבקרה מעדכן את הרשימה, את הלשונית "בקרת שומות" ואת ציר הזמן.</li>
          </ul>
          <ul className="insights">
            <li><b>פרויקטים:</b> המאגר, חיפוש, קיבוץ ומעקב. <b>בקרת שומות:</b> כל הבקרות במקום אחד. <b>ניתוח:</b> גרפים. <b>יומן:</b> הערות, משימות וסל מחזור. <b>מדריך:</b> הדף הזה.</li>
            <li><b>הגדרות:</b> כתובות מייל, אנשי קשר, קישור כניסה לשיתוף, התקנה כאפליקציה בכרום, עריכה ושדרוג ב־Claude, וקישור לפרויקט המחקר.</li>
            <li><b>כרום:</b> האפליקציה בנויה לכרום. מתקינים אותה פעם אחת מההגדרות, ומאז היא נפתחת מסמל בשולחן העבודה.</li>
          </ul>
        </div>
      </Section>

      <Section id="start" label="חמש דקות להתחלה" title="צעדים ראשונים">
        <ol className="steps">
          <li>להיכנס בקישור האישי, בכרום.</li>
          <li>בהגדרות: להתקין כאפליקציה, ולבדוק את כתובות המייל ואנשי הקשר.</li>
          <li>ב"פרויקטים": לסנן "ממתין לעירייה" או "ממתין ליזם", ולשלוח תזכורות.</li>
          <li>ב"בקרת שומות": לפתוח בקרה לחוות דעת, להעלות את שלושת הדוחות (או לגרור אותם), ולסמן ✓ / ✗.</li>
          <li>לשלוח מכתב הוראות, ולסמן "נשלח, לתייק".</li>
        </ol>
        <span className="label">מונחים</span>
        <dl className="guide-list">{GLOSSARY.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </Section>
      </TabContext.Provider>
    </div>
  );
}
