import React from 'react';
import { motion } from 'framer-motion';
import { ease } from '../ui.jsx';
import { REPORTS, million } from '../../lib/reports/index.js';

// "דוחות שמאות": appraisal reports turned into readable digital documents.
export default function ReportsView() {
  return (
    <div className="page">
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">דוחות שמאות · מסמך דיגיטלי</span>
          <h1 className="display-l">דוחות שמאות<br /><span className="thin">לקרוא שומה כמו שקוראים תכנית</span></h1>
          <p className="lead">
            כל דוח כאן פורק מ־PDF למסמך שאפשר לנווט בו: מה המסמך, איך הוא בנוי, מאין בא כל מספר,
            ומה קורה לשורה התחתונה כשהנחה אחת זזה.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="label">{REPORTS.length} {REPORTS.length === 1 ? 'דוח' : 'דוחות'} · לחיצה פותחת את המסמך</span>
            <h2 className="display-s">רשימת הדוחות</h2>
          </div>
        </div>
        <div className="report-list">
          {REPORTS.map((r, i) => (
            <motion.a key={r.id} href={`#/d/${r.id}`} className="mail-card report-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 * i, ease }}>
              <span className="label">{r.plan} · {r.city}</span>
              <b className="report-card-title">{r.title}</b>
              <span>{r.kind} · {r.appraiser}</span>
              <span className="chips">
                <span className="pill pill-none">{r.pages} עמודים</span>
                <span className="pill pill-none">מועד קובע {r.effective}</span>
                <span className="pill pill-none">{r.result.units} יח"ד</span>
                <span className="pill pill-none">רווח {million(r.result.profit)} מיליון ₪ · {r.result.onCost}% מהעלויות</span>
              </span>
              <span className="btn btn-primary report-open">פתיחת המסמך הדיגיטלי</span>
            </motion.a>
          ))}
        </div>
        <p className="hint">דוח נוסף נכנס לרשימה כששולחים את ה־PDF שלו בשיחת עריכה ב־Claude (הקישור בהגדרות). שמות בעלי הדירות והמשכנתאות אינם מועתקים למסמך הדיגיטלי.</p>
      </section>
    </div>
  );
}
