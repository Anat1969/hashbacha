import React, { createContext, useContext, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ease } from '../ui.jsx';
import { PARAMS, CHAPTERS } from '../../lib/review/rules.js';
import { PROFIT_THRESHOLD } from '../../lib/config.js';
import { SOURCES, SIM_BASE, simulate, breakEvenPrice, fmt, million } from '../../lib/reports/index.js';

const SECTIONS = [
  ['essence', 'תמצית'],
  ['structure', 'מבנה הדוח'],
  ['plan', 'מקיים למוצע'],
  ['income', 'תקבולים'],
  ['costs', 'עלויות'],
  ['result', 'רווח ורגישות'],
  ['accuracy', 'כמה זה מדויק'],
  ['control', 'שאלות לבקרה']
];
export const REPORT_SECTIONS = SECTIONS;

const TabContext = createContext({ cur: 'essence', base: '' });

function Section({ id, label, title, children }) {
  const { cur, base } = useContext(TabContext);
  if (cur !== id) return null;
  const i = SECTIONS.findIndex(([x]) => x === id);
  const prev = SECTIONS[i - 1]; const next = SECTIONS[i + 1];
  return (
    <motion.section role="tabpanel" className="panel report-section" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
      <div className="panel-head">
        <div>
          <span className="label">פרק {String(i + 1).padStart(2, '0')} מתוך {String(SECTIONS.length).padStart(2, '0')} · {label}</span>
          <h2 className="display-s">{title}</h2>
        </div>
      </div>
      {children}
      <div className="guide-pager">
        {prev ? <a className="btn btn-ghost" href={`${base}/${prev[0]}`}>לפרק הקודם: {prev[1]}</a> : <span />}
        {next && <a className="btn btn-ghost" href={`${base}/${next[0]}`}>לפרק הבא: {next[1]}</a>}
      </div>
    </motion.section>
  );
}

const Src = ({ k }) => <span className={`pill pill-${SOURCES[k].tone === 'green' ? 'none' : SOURCES[k].tone}`}>{SOURCES[k].label}</span>;
const Page = ({ p }) => <span className="num">עמ׳ {p}</span>;
const Insight = ({ children }) => <p className="report-insight"><span className="label">תובנה</span>{children}</p>;
const KIND = { fact: ['כתוב בדוח', 'none'], calc: ['חישוב שלנו', 'amber'], check: ['לבדיקה', 'red'] };
const arrow = (v) => (v > PROFIT_THRESHOLD ? <span className="arrow-up">↑</span> : <span className="arrow-down">↓</span>);

// Where every shekel of revenue goes. Only the levy is coloured: it is the city's share.
const SHADES = { dev: '#3a3c41', pb: '#5b5d63', fin: '#8b8d92', pub: '#a3a49f', init: '#c9cac6' };
function MoneyBar({ r }) {
  const parts = [...r.costs.map((c) => ({ ...c, share: c.sum / r.revenueTotal })), { id: 'profit', name: 'רווח יזמי', sum: r.result.profit, share: r.result.profit / r.revenueTotal }];
  const bg = (id) => (id === 'profit' ? '#111214' : SHADES[id]);
  return (
    <div className="money">
      <div className="statusbar-track money-track" role="img" aria-label="חלוקת התקבולים בין העלויות לרווח">
        {parts.map((x) => <span key={x.id} className={`seg${x.id === 'levy' ? ' seg-amber' : ''}`} style={{ width: `${x.share * 100}%`, background: x.id === 'levy' ? undefined : bg(x.id) }} title={`${x.name}: ${fmt(x.sum)}`} />)}
      </div>
      <div className="statusbar-legend">
        {parts.map((x) => (
          <span key={x.id} className="legend-item">
            <i className={`dot${x.id === 'levy' ? ' dot-amber' : ''}`} style={x.id === 'levy' ? undefined : { background: bg(x.id) }} />
            {x.name} <b>{(x.share * 100).toFixed(1)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Simulator({ r }) {
  const [v, setV] = useState(SIM_BASE);
  const out = simulate(v);
  const base = simulate(SIM_BASE);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: Number(e.target.value) }));
  const changed = Object.keys(SIM_BASE).some((k) => v[k] !== SIM_BASE[k]);
  const delta = out.profit - base.profit;
  const sliders = [
    ['price', 'מחיר מכירה למ"ר', -25, 15, 1, (x) => `${x > 0 ? '+' : ''}${x}%`, 'נתון שוק מותאם'],
    ['build', 'עלות בנייה למ"ר', -10, 30, 1, (x) => `${x > 0 ? '+' : ''}${x}%`, 'הנחיה מוכתבת: 5,500 ₪'],
    ['months', 'תקופת הבנייה', 36, 84, 6, (x) => `${x} חודשים`, 'שיקול דעת: 48 חודשים']
  ];
  return (
    <div className="sim">
      <div className="sim-controls">
        {sliders.map(([k, label, min, max, step, show, note]) => (
          <label key={k} className="sim-row">
            <span className="sim-label"><b>{label}</b><span className="mono sim-value" data-sim={k}>{show(v[k])}</span></span>
            <input type="range" min={min} max={max} step={step} value={v[k]} onChange={set(k)} aria-label={label} />
            <span className="label">{note}</span>
          </label>
        ))}
        <div className="sim-row">
          <span className="sim-label"><b>שיעור היטל ההשבחה</b><span className="mono sim-value">{v.levy}%</span></span>
          <div className="seg-control" role="group" aria-label="שיעור היטל ההשבחה">
            {[[0, 'פטור'], [25, '25%'], [50, '50%']].map(([x, l]) => <button key={x} type="button" className={v.levy === x ? 'on' : ''} aria-pressed={v.levy === x} onClick={() => setV((s) => ({ ...s, levy: x }))}>{l}</button>)}
          </div>
          <span className="label">הנחת עבודה: 50%, החלטת מועצת העיר</span>
        </div>
        <button type="button" className="btn btn-ghost" disabled={!changed} onClick={() => setV(SIM_BASE)}>חזרה להנחות הדוח</button>
      </div>
      <div className="sim-out">
        <dl className="summary">
          <div><dt className="label">תקבולים</dt><dd>{million(out.revenue)}</dd></div>
          <div><dt className="label">עלויות</dt><dd>{million(out.cost)}</dd></div>
          <div><dt className="label">רווח, מיליון ₪</dt><dd data-sim="profit" className={out.profit < 0 ? 'neg' : ''}>{million(out.profit)}</dd></div>
          <div><dt className="label">רווח מהעלויות</dt><dd data-sim="oncost">{out.onCost.toFixed(1)}% {arrow(out.onCost)}</dd></div>
          <div><dt className="label">רווח מהמכירות</dt><dd>{out.onSales.toFixed(1)}% {arrow(out.onSales)}</dd></div>
        </dl>
        <p className="sim-delta" data-sim="delta">
          {changed
            ? <><b>{delta >= 0 ? 'הרווח גדל' : 'הרווח קטן'} ב־{million(Math.abs(delta))} מיליון ₪</b> לעומת הדוח ({million(base.profit)}).{out.onCost < r.agreementProfit ? ` מתחת ל־${r.agreementProfit}% שטיוטת ההסכם דורשת.` : ` מעל ${r.agreementProfit}% שטיוטת ההסכם דורשת.`}</>
            : <>זו התוצאה של הדוח. הזיזו הנחה אחת וראו כמה הרווח רגיש אליה.</>}
        </p>
        <p className="hint">מודל פשוט שלנו, לא של השמאי: כל שורת עלות נעה עם הגורם שהדוח עצמו קושר אותה אליו. ההיטל משתנה רק לפי השיעור. החץ משווה לבנצ׳מרק של {PROFIT_THRESHOLD}% באפליקציה.</p>
      </div>
    </div>
  );
}

export default function ReportPage({ report: r, tab }) {
  const cur = SECTIONS.some(([id]) => id === tab) ? tab : SECTIONS[0][0];
  const base = `#/d/${r.id}`;
  const [stickTop, setStickTop] = useState(76);
  useEffect(() => {
    const measure = () => { const h = document.querySelector('.topbar')?.getBoundingClientRect().height; if (h) setStickTop(Math.round(h) + 6); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const be = Math.abs(breakEvenPrice()).toFixed(0);
  const maxSum = Math.max(...r.costs.map((c) => c.sum));
  const srcCount = (k) => r.unitCosts.filter((u) => u[2] === k).length;

  return (
    <div className="page guide report">
      <a className="back" href="#/d">לרשימת הדוחות</a>
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">{r.plan} · {r.city} · {r.kind}</span>
          <h1 className="display-l">{r.title}<br /><span className="thin">דוח שמאי, פרוק לחלקיו</span></h1>
          <p className="lead">{r.address}. מזמין: {r.developer}. שמאי: {r.appraiser}. נחתם ב־{r.written}, נכון ל־{r.effective}. {r.pages} עמודים.</p>
        </div>
      </section>

      <nav className="seg-control guide-tabs" role="tablist" aria-label="פרקי הדוח הדיגיטלי" style={{ top: stickTop }}>
        {SECTIONS.map(([id, l], i) => (
          <a key={id} role="tab" aria-selected={cur === id} className={cur === id ? 'on' : ''} href={`${base}/${id}`}>
            <span className="mono">{String(i + 1).padStart(2, '0')}</span> {l}
          </a>
        ))}
      </nav>

      <TabContext.Provider value={{ cur, base }}>

        <Section id="essence" label="מה המסמך הזה ולמה הוא נכתב" title="תחשיב כדאיות, לא שומת השבחה">
          <div className="money-head">
            <span className="label">לאן הולך כל שקל מהתקבולים · {million(r.revenueTotal)} מיליון ₪ בלי מע"מ</span>
            <MoneyBar r={r} />
          </div>
          <div className="tiles report-tiles">
            {[['דירות', '110 ← 532'], ['תקבולים, מיליון ₪', million(r.revenueTotal)], ['עלויות, מיליון ₪', million(r.costTotal)], ['רווח, מיליון ₪', million(r.result.profit)], ['רווח מהעלויות', `${r.result.onCost}%`]].map(([l, val]) => (
              <div key={l} className="tile"><span className="label">{l}</span><span className="tile-value">{val}</span></div>
            ))}
          </div>
          <p className="hint">שיעור הרווח: {r.result.onCost}% מהעלויות, {r.result.onSales.toFixed(1)}% מהמכירות. אותו רווח, שני מכנים.</p>
          <div className="insight-grid report-gap">
            <div className="guide-card"><span className="label">מה המסמך</span><p className="guide-big">{r.is}</p></div>
            <div className="guide-card"><span className="label">מה הוא לא</span><p className="guide-big">{r.isNot}</p></div>
          </div>
          <Insight><b>כל הדוח הוא משוואה אחת:</b> תקבולים פחות עלויות שווה רווח. {r.purpose}</Insight>
          <div className="insight-grid report-gap">
            <div>
              <span className="label">השחקנים</span>
              <dl className="guide-list">{r.actors.map(([k, t]) => <div key={k}><dt>{k}</dt><dd>{t}</dd></div>)}</dl>
            </div>
            <div>
              <span className="label">נקודת המינוף</span>
              <div className="guide-card report-lever"><p className="guide-big">{r.leverage}</p></div>
              <span className="label report-gap-s">חתומים על הדוח</span>
              <p className="hint">{r.signers}. {r.file}. מתכנן: {r.architect}.</p>
            </div>
          </div>
        </Section>

        <Section id="structure" label="14 פרקים בשש שכבות" title="איך הדוח בנוי">
          <Insight><b>רוב הדוח הוא רקע.</b> {r.structureInsight}</Insight>
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>פרק</th><th>שם הפרק בדוח</th><th>עמודים</th><th>מה יש בו</th></tr></thead>
              <tbody>
                {r.layers.map((l) => (
                  <React.Fragment key={l.name}>
                    <tr className="group-row"><td colSpan={4}><span className="group-label">{l.name}</span><span className="label">{l.q}</span></td></tr>
                    {l.chapters.map(([n, name, pages, what]) => (
                      <tr key={n} className="row">
                        <td data-label="פרק" className="mono">{String(n).padStart(2, '0')}</td>
                        <td data-label="שם הפרק"><span className="project-name">{name}</span></td>
                        <td data-label="עמודים" className="mono">{pages}</td>
                        <td data-label="מה יש בו">{what}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">מי שקורא שומה בפעם הראשונה מתחיל מפרק 14, חוזר לפרק 10, ורק אז קורא את השאר. השורה התחתונה וההנחות הן העיקר.</p>
        </Section>

        <Section id="plan" label="מה יש היום ומה התכנית מאפשרת" title="מ־110 דירות ל־532">
          <div className="insight-grid">
            <div>
              <span className="label">מצב קיים</span>
              <dl className="guide-list">{r.existing.map(([k, val, , p]) => <div key={k}><dt>{k} <Page p={p} /></dt><dd>{val}</dd></div>)}</dl>
            </div>
            <div>
              <span className="label">מצב מוצע</span>
              <dl className="guide-list">{r.proposed.map(([k, val, , p]) => <div key={k}><dt>{k} <Page p={p} /></dt><dd>{val}</dd></div>)}</dl>
            </div>
          </div>
          <span className="label report-gap-s">חלוקת הקרקע בתכנית · 11,574 מ"ר</span>
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>ייעוד</th><th>תאי שטח</th><th>מ"ר</th><th>חלק מהמתחם</th></tr></thead>
              <tbody>{r.landUse.map(([n, cells, sqm, pct]) => (
                <tr key={n} className="row">
                  <td data-label="ייעוד"><span className="project-name">{n}</span></td>
                  <td data-label="תאי שטח" className="mono">{cells}</td>
                  <td data-label='מ"ר' className="mono">{fmt(sqm)}</td>
                  <td data-label="חלק"><span className="bar-share"><i style={{ width: `${pct}%` }} /></span> <span className="mono">{pct}%</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <span className="label report-gap-s">התמורה לבעלי הדירות: שתי גרסאות</span>
          <div className="insight-grid">
            <div className="guide-card"><span className="label">{r.tmura.report[0]} · כך חושב בשומה</span><p className="guide-big">{r.tmura.report[1]}</p></div>
            <div className="guide-card"><span className="label">{r.tmura.draft[0]}</span><p className="guide-big">{r.tmura.draft[1]}</p></div>
          </div>
          <Insight><b>הפער הזה אינו בתחשיב.</b> {r.tmura.insight} {r.tmura.signed}</Insight>
        </Section>

        <Section id="income" label="צד ההכנסות" title="איך נקבע מחיר לדירה שעוד לא נבנתה">
          <ol className="guide-flow report-flow">
            {r.incomeSteps.map(([t, d], i) => (
              <li key={t} className="mail-card guide-step"><span className="opinion-num mono">{String(i + 1).padStart(2, '0')}</span><b>{t}</b><span>{d}</span></li>
            ))}
          </ol>
          <div className="insight-grid report-gap">
            <div>
              <span className="label">השווי שנבחר למ"ר אקוויוולנטי · עמ׳ 54</span>
              <div className="table-wrap guide-table">
                <table className="table">
                  <thead><tr><th>סוג</th><th>₪ למ"ר</th></tr></thead>
                  <tbody>{r.values.map(([n, val]) => (
                    <tr key={n} className="row"><td data-label="סוג">{n}</td><td data-label='₪ למ"ר'><span className="bar-share"><i style={{ width: `${(val / 28000) * 100}%` }} /></span> <span className="mono">{fmt(val)}</span></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div>
              <span className="label">הפדיון מדירות היזם, כולל מע"מ · עמ׳ 55</span>
              <div className="table-wrap guide-table">
                <table className="table">
                  <thead><tr><th>דירה</th><th>יח"ד</th><th>מ"ר אקו׳</th><th>₪ לדירה</th><th>סה"כ, אלפי ₪</th></tr></thead>
                  <tbody>{r.sales.map(([n, u, eq, , unit, tot]) => (
                    <tr key={n} className="row">
                      <td data-label="דירה"><span className="project-name">{n}</span></td>
                      <td data-label='יח"ד' className="mono">{u}</td>
                      <td data-label='מ"ר אקו׳' className="mono">{eq}</td>
                      <td data-label="₪ לדירה" className="mono">{fmt(unit)}</td>
                      <td data-label='סה"כ' className="mono">{fmt(tot)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <dl className="summary">
                {r.revenue.map(([n, val]) => <div key={n}><dt className="label">{n}</dt><dd>{million(val)}</dd></div>)}
                <div><dt className="label">סה"כ תקבולים, מיליון ₪</dt><dd>{million(r.revenueTotal)}</dd></div>
              </dl>
            </div>
          </div>
          <Insight><b>110 דירות הבעלים אינן הכנסה.</b> שוויין, {million(r.ownersValue)} מיליון ₪, הוא מה שהיזם נותן כדי לקבל את הקרקע. {r.capExample}</Insight>
        </Section>

        <Section id="costs" label="צד ההשקעה" title="שישה סלים של עלות">
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>סל</th><th>אלפי ₪</th><th>חלק מהעלות</th><th>מה בתוכו</th></tr></thead>
              <tbody>{r.costs.map((c) => (
                <tr key={c.id} className="row">
                  <td data-label="סל"><span className="project-name">{c.name}</span> <Page p={c.p} /></td>
                  <td data-label="אלפי ₪" className="mono">{fmt(c.sum)}</td>
                  <td data-label="חלק"><span className="bar-share"><i className={c.id === 'levy' ? 'is-levy' : ''} style={{ width: `${(c.sum / maxSum) * 100}%` }} /></span> <span className="mono">{((c.sum / r.costTotal) * 100).toFixed(1)}%</span></td>
                  <td data-label="מה בתוכו">{c.text}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Insight><b>שני שלישים מהעלות הם בנייה ישירה.</b> לכן המספר החשוב ביותר בצד הזה הוא עלות הבנייה למ"ר. {r.costInsight}</Insight>
          <span className="label report-gap-s">מספרי היסוד, ומאין כל אחד בא · עמ׳ 49</span>
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>הנחה</th><th>ערך</th><th>מקור</th></tr></thead>
              <tbody>{r.unitCosts.map(([n, val, k]) => (
                <tr key={n} className="row"><td data-label="הנחה">{n}</td><td data-label="ערך" className="mono">{val}</td><td data-label="מקור"><Src k={k} /></td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="hint">מתוך {r.unitCosts.length} מספרי היסוד כאן: {srcCount('dictated')} מוכתבים, {srcCount('judgement')} בשיקול דעת השמאי, {srcCount('legal')} הנחות עבודה. אף אחד מהם לא נמדד בפרויקט הזה.</p>
        </Section>

        <Section id="result" label="השורה התחתונה, וכמה היא יציבה" title="רווח של 159 מיליון ₪, ומה מזיז אותו">
          <Insight><b>ירידה של {be}% במחיר המכירה מוחקת את כל הרווח.</b> הרווח הוא הפרש קטן בין שני מספרים גדולים, ולכן הוא רגיש מאוד לכל הנחה.</Insight>
          <Simulator r={r} />
          <ul className="insights report-gap">
            <li>טיוטת ההסכם עם הדיירים מתנה את העסקה ברווחיות של <b>{r.agreementProfit}% לפחות</b> בדוח האפס, ובפטור מלא מהיטל השבחה (עמ׳ 41). השומה מציגה {r.result.onCost}% ומניחה היטל של 50%.</li>
            <li>לכן שאלת ההיטל אינה שולית: המעבר מ־50% לפטור מוסיף לרווח 43.9 מיליון ₪. נסו בסימולטור.</li>
            <li>השומה אינה כוללת ניתוח רגישות משלה. הסימולטור כאן משלים את החסר.</li>
          </ul>
        </Section>

        <Section id="accuracy" label="התשובה לשאלה: האם זה מדע מדויק" title="החשבון מדויק. הקלט הוא הערכה">
          <div className="insight-grid">
            {r.truths.map(([t, d]) => <div key={t} className="guide-card"><span className="label">{t}</span><p className="guide-big">{d}</p></div>)}
          </div>
          <span className="label report-gap-s">ארבע גישות לשווי, וכולן בדוח הזה</span>
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>גישה</th><th>השאלה שהיא שואלת</th><th>איפה בדוח</th></tr></thead>
              <tbody>{r.approaches.map(([n, q, w]) => (
                <tr key={n} className="row"><td data-label="גישה"><span className="project-name">{n}</span></td><td data-label="השאלה">{q}</td><td data-label="איפה בדוח">{w}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <span className="label report-gap-s">מפת הוודאות: שישה סוגי מספרים</span>
          <dl className="guide-list report-sources">
            {Object.entries(SOURCES).map(([k, s]) => <div key={k}><dt><Src k={k} /></dt><dd>{s.text}</dd></div>)}
          </dl>
          <div className="legend review-legend" role="note">
            <span className="legend-item"><i className="dot dot-none" />אפשר לאמת מול מסמך</span>
            <span className="legend-item"><i className="dot dot-amber" />נשען על בחירה של מישהו אחר</span>
            <span className="legend-item"><i className="dot dot-red" />נשען על שיקול דעת או על הנחה</span>
          </div>
          <span className="label report-gap-s">איך מתקרבים לשווי, בחמישה צעדים</span>
          <ol className="steps">{r.controlHow.map((s) => <li key={s}>{s}</li>)}</ol>
        </Section>

        <Section id="control" label="מה לשאול את השמאי, ומה הדוח נותן לבקרה" title={`${r.findings.length} שאלות שעלו מהקריאה`}>
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>מה מצאנו</th><th>איפה</th><th>למה זה חשוב</th><th>סוג</th></tr></thead>
              <tbody>{r.findings.map(([t, where, why, k]) => (
                <tr key={t} className="row">
                  <td data-label="מה מצאנו"><span className="project-name">{t}</span></td>
                  <td data-label="איפה" className="mono">{where}</td>
                  <td data-label="למה חשוב">{why}</td>
                  <td data-label="סוג"><span className={`pill pill-${KIND[k][1]}`}>{KIND[k][0]}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <span className="label report-gap-s">מול 22 הפרמטרים של "בקרת שומות"</span>
          <Insight><b>{PARAMS.filter((x) => !r.params[x.id]).length} מתוך 22 הפרמטרים חסרים בדוח,</b> וכולם שייכים לשווי המצב הקודם ולהשבחה. זו ההוכחה שהמסמך הוא תחשיב כדאיות ולא שומת היטל.</Insight>
          <div className="table-wrap guide-table">
            <table className="table">
              <thead><tr><th>קוד</th><th>פרמטר</th><th>בדוח הזה</th><th>הערה</th></tr></thead>
              <tbody>
                {CHAPTERS.map((ch, ci) => (
                  <React.Fragment key={ch}>
                    <tr className="group-row"><td colSpan={4}><span className="group-label">{ch}</span></td></tr>
                    {PARAMS.filter((x) => x.ch === ci).map((x) => {
                      const val = r.params[x.id];
                      return (
                        <tr key={x.id} className="row">
                          <td data-label="קוד" className="mono">{x.id}</td>
                          <td data-label="פרמטר">{x.label} <span className="num">{x.unit}</span></td>
                          <td data-label="בדוח הזה">{val ? <span className="mono">{val[0]}</span> : <span className="pill pill-none">אין בדוח</span>}</td>
                          <td data-label="הערה">{val ? val[1] : ''}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <span className="label report-gap-s">מונחים</span>
          <dl className="guide-list">{r.glossary.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
        </Section>
      </TabContext.Provider>
    </div>
  );
}
