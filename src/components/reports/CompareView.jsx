import React, { useState } from 'react';
import { CARDS, TOPICS, ASSUMPTIONS, RESULTS, FORM, topicState, isSame, compareSummary, spread } from '../../lib/reports/compare.js';
import { projectForReport, reportHref } from '../../lib/reports/index.js';

const FILTERS = [['all', 'הכול'], ['diff', 'רק הבדלים'], ['same', 'רק מה שזהה']];
const STATE = { all: ['בכל הדוחות', 'green'], some: ['בחלק מהדוחות', 'amber'], none: ['חסר בכולם', 'red'] };
const num = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const Insight = ({ children }) => <p className="report-insight"><span className="label">תובנה</span>{children}</p>;

function groups(rows) {
  const out = [];
  rows.forEach((r) => { const g = out.find((x) => x.name === r[0]); if (g) g.rows.push(r); else out.push({ name: r[0], rows: [r] }); });
  return out;
}

// One table shape for every comparison: a parameter, one column per report, and a verdict.
function Matrix({ head = 'נושא', children }) {
  return (
    <div className="table-wrap guide-table">
      <table className="table table-compare">
        <thead><tr><th>{head}</th>{CARDS.map((c) => <th key={c.id}>{c.plan}<span className="th-sub">{c.appraiser}</span></th>)}<th>מצב</th></tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const Cells = ({ vals, render = (v) => v }) => vals.map((v, i) => (
  <td key={CARDS[i].id} data-label={CARDS[i].plan}>{v === null ? <span className="pill pill-red">אין</span> : render(v, i)}</td>
));

export default function CompareView({ ctx }) {
  const [filter, setFilter] = useState('all');
  const sum = compareSummary();
  const keep = (identical) => filter === 'all' || (filter === 'same') === identical;
  const topics = TOPICS.filter((t) => keep(topicState(t[2]) !== 'some'));
  const assumptions = ASSUMPTIONS.filter((a) => keep(isSame(a[2])));

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">התשובה לשאלה: האם יש פורמט קבוע</span>
            <h2 className="display-s">התוכן קבוע. הצורה לא</h2>
          </div>
        </div>
        <div className="tiles report-tiles">
          {[['נושאים שנבדקו', sum.topics], ['מופיעים בכל הדוחות', sum.core], ['חסרים בכולם', sum.missing], ['מופיעים רק בחלק', sum.partial], ['הנחות זהות', `${sum.sameAssumptions} מתוך ${sum.assumptions}`]].map(([l, v]) => (
            <div key={l} className="tile"><span className="label">{l}</span><span className="tile-value">{v}</span></div>
          ))}
        </div>
        <Insight><b>תקן 21.1 מכתיב מה לענות, לא איך לסדר.</b> {sum.core} מתוך {sum.topics} הנושאים מופיעים אצל שלושת השמאים, אבל במספור אחר, בסדר אחר ובמקום אחר. שני נושאים חסרים בכולם: חישוב היטל ההשבחה וניתוח רגישות.</Insight>
        <div className="report-list compare-cards">
          {CARDS.map((c) => {
            const entry = projectForReport(c, ctx?.data?.projects);
            return (
              <div key={c.id} className="guide-card">
                <span className="label">{c.plan} · {c.quarter}</span>
                <p className="guide-big">{c.title}</p>
                <p className="hint">שמאי: {c.appraiser}. יזם: {c.developer}. נחתם {c.written}, מועד קובע {c.effective}. {c.pages} עמודים. {c.checked}.</p>
                <div className="chips">
                  {c.digital && <a className="chip" href={reportHref(c)}>המסמך הדיגיטלי</a>}
                  {entry && <a className="chip" href={`#/p/${entry.project._id}`}>כרטיס הפרויקט</a>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="chips compare-filter" role="group" aria-label="סינון שורות ההשוואה">
        {FILTERS.map(([id, l]) => <button key={id} type="button" className={`chip-btn${filter === id ? ' on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>)}
      </div>

      <section className="panel" id="compare-skeleton">
        <div className="panel-head"><div>
          <span className="label">שלד הדוח · {topics.length} מתוך {TOPICS.length} נושאים · בכל תא: היכן בדוח, ובאילו עמודים</span>
          <h2 className="display-s">איפה כל שמאי שם כל נושא</h2>
        </div></div>
        <Matrix>
          {groups(topics).map((g) => (
            <React.Fragment key={g.name}>
              <tr className="group-row"><td colSpan={CARDS.length + 2}><span className="group-label">{g.name}</span></td></tr>
              {g.rows.map(([, name, vals]) => {
                const st = STATE[topicState(vals)];
                return (
                  <tr key={name} className="row">
                    <td data-label="נושא"><span className="project-name">{name}</span></td>
                    <Cells vals={vals} render={(v) => <span className="mono">{v}</span>} />
                    <td data-label="מצב"><span className={`pill pill-${st[1]}`}>{st[0]}</span></td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </Matrix>
        {filter !== 'same' && (
          <>
            <span className="label report-gap-s">הבדלי צורה</span>
            <Matrix head="מאפיין">
              {FORM.map(([name, vals]) => (
                <tr key={name} className="row">
                  <td data-label="מאפיין"><span className="project-name">{name}</span></td>
                  <Cells vals={vals} />
                  <td data-label="מצב"><span className={`pill pill-${isSame(vals) ? 'green' : 'amber'}`}>{isSame(vals) ? 'זהה' : 'שונה'}</span></td>
                </tr>
              ))}
            </Matrix>
          </>
        )}
      </section>

      <section className="panel" id="compare-assumptions">
        <div className="panel-head"><div>
          <span className="label">ההנחות · {assumptions.length} מתוך {ASSUMPTIONS.length} · {sum.sameAssumptions} זהות בשלושת הדוחות</span>
          <h2 className="display-s">אותה שאלה, שלושה מספרים</h2>
        </div></div>
        <Insight><b>מה שזהה הוא מה שהוכתב.</b> תוספת של 12 מ"ר, הריסה ב־350 ₪, בצ"מ של 5%, מס רכישה ומע"מ. בכל השאר כל שמאי בחר לבד: ריבית מ־5.5% עד 7%, שכר דירה מ־2,900 עד 3,700 ₪.</Insight>
        <Matrix head="הנחה">
          {groups(assumptions).map((g) => (
            <React.Fragment key={g.name}>
              <tr className="group-row"><td colSpan={CARDS.length + 2}><span className="group-label">{g.name}</span></td></tr>
              {g.rows.map(([, name, vals, note]) => (
                <tr key={name} className="row">
                  <td data-label="הנחה"><span className="project-name">{name}</span>{note && <span className="project-sub">{note}</span>}</td>
                  <Cells vals={vals} render={(v) => <span className="mono">{v}</span>} />
                  <td data-label="מצב"><span className={`pill pill-${isSame(vals) ? 'green' : 'amber'}`}>{isSame(vals) ? 'זהה' : 'שונה'}</span></td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </Matrix>
      </section>

      {filter !== 'same' && (
        <section className="panel" id="compare-results">
          <div className="panel-head"><div>
            <span className="label">השורה התחתונה · הפס מראה את הערך יחסית לגבוה מבין השלושה</span>
            <h2 className="display-s">שלושה מתחמים, כמעט אותו שיעור רווח</h2>
          </div></div>
          <Insight><b>הרווח מתכנס ל־20% עד 21% מהעלויות.</b> תמ"ל 2023: 20.5%. תמ"ל 2022: 20.1%. תמ"ל 2047: 20.9% אחרי הנספח. הפרויקטים שונים פי 4 בגודלם, והתוצאה כמעט זהה. הערכה שלנו: הזכויות בתכנית מכוילות לרף הרווח, כך שהרווח הוא גם קלט ולא רק תוצאה.</Insight>
          <Matrix head="מדד">
            {RESULTS.map(([name, vals, d, unit, kind, note]) => {
              const max = Math.max(...vals);
              return (
                <tr key={name} className="row">
                  <td data-label="מדד"><span className="project-name">{name}</span> <span className="num">{unit}</span>{note && <span className="project-sub">{note}</span>}</td>
                  <Cells vals={vals} render={(v) => <><span className="bar-share"><i style={{ width: `${(v / max) * 100}%` }} /></span><span className="mono">{num(v, d)}</span></>} />
                  <td data-label="מצב"><span className={`pill pill-${kind === 'calc' ? 'amber' : 'none'}`}>{kind === 'calc' ? 'חישוב שלנו' : 'כתוב בדוח'}</span> <span className="num">פער {spread(vals).toFixed(0)}%</span></td>
                </tr>
              );
            })}
          </Matrix>
          <Insight><b>ההיטל לכל דירה לשיווק נע בין 46 ל־104 אלף ₪.</b> שלושתם באשדוד, שלושתם ב־50%, ואף דוח אינו מציג את החישוב. זו השאלה הראשונה לשמאי הוועדה.</Insight>
        </section>
      )}
    </>
  );
}
