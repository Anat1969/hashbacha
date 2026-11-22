import React from 'react';
import { motion } from 'framer-motion';
import { ease } from '../ui.jsx';
import { reportHref, projectForReport } from '../../lib/reports/index.js';
import { CARDS, compareSummary } from '../../lib/reports/compare.js';
import CompareView from './CompareView.jsx';

// "דוחות שמאות": appraisal reports as digital documents, and a comparison between them.
export default function ReportsView({ ctx, compare = false }) {
  const sum = compareSummary();
  return (
    <div className="page">
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">דוחות שמאות · מסמך דיגיטלי והשוואה</span>
          <h1 className="display-l">דוחות שמאות<br /><span className="thin">{compare ? 'אותו תוכן, צורה אחרת בכל דוח' : 'לקרוא שומה כמו שקוראים תכנית'}</span></h1>
          <p className="lead">
            {compare
              ? `${sum.reports} דוחות, ${sum.reports} שמאים, אותו תקן. ההשוואה מראה מה קבוע בכולם, מה חסר בכולם, ואיפה כל שמאי בחר אחרת.`
              : 'כל דוח כאן פורק מ־PDF למסמך שאפשר לנווט בו: מה המסמך, איך הוא בנוי, מאין בא כל מספר, ומה קורה לשורה התחתונה כשהנחה אחת זזה.'}
          </p>
        </div>
      </section>

      <div className="seg-control detail-tabs" role="tablist" aria-label="תצוגת הדוחות">
        <a role="tab" aria-selected={!compare} className={!compare ? 'on' : ''} href="#/d">רשימת הדוחות<span className="mono tab-count">{CARDS.length}</span></a>
        <a role="tab" aria-selected={compare} className={compare ? 'on' : ''} href="#/d/compare">השוואה בין הדוחות</a>
      </div>

      {compare ? <CompareView ctx={ctx} /> : (
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="label">{CARDS.length} דוחות · כולם בדיקת כדאיות כלכלית לפי תקן 21.1, אשדוד</span>
              <h2 className="display-s">רשימת הדוחות</h2>
            </div>
            <a className="btn btn-primary" href="#/d/compare">השוואה בין הדוחות</a>
          </div>
          <div className="report-list">
            {CARDS.map((r, i) => {
              const entry = projectForReport(r, ctx?.data?.projects);
              return (
                <motion.a key={r.id} href={reportHref(r)} className="mail-card report-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 * i, ease }}>
                  <span className="label">{r.plan} · {r.quarter} · {r.appraiser}</span>
                  <b className="report-card-title">{r.title}</b>
                  <span>יזם: {r.developer} · נחתם {r.written}</span>
                  <span className="chips">
                    <span className="pill pill-none">{r.pages} עמודים</span>
                    <span className="pill pill-none">{r.existing} ← {r.units.toLocaleString('en-US')} יח"ד</span>
                    <span className={`pill ${entry ? 'pill-green' : 'pill-none'}`}>{entry ? 'מקושר לפרויקט במאגר' : 'אין פרויקט מקושר'}</span>
                    <span className="pill pill-none">{r.checked}</span>
                  </span>
                  <span className={`btn ${r.digital ? 'btn-primary' : 'btn-ghost'} report-open`}>{r.digital ? 'פתיחת המסמך הדיגיטלי' : 'בהשוואה בלבד · לפתיחת ההשוואה'}</span>
                </motion.a>
              );
            })}
          </div>
          <p className="hint">שמות בעלי הדירות והמשכנתאות אינם מועתקים. דוח הופך למסמך דיגיטלי מלא כשמבקשים זאת בשיחת העריכה ב־Claude.</p>
        </section>
      )}
    </div>
  );
}
