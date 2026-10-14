import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js';
import { flatOpinions, mean, profitColor } from '../lib/calc.js';
import { PROFIT_THRESHOLD } from '../lib/config.js';
import { ease } from './ui.jsx';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
Chart.defaults.font.family = "'IBM Plex Sans Hebrew', system-ui, sans-serif";
Chart.defaults.color = '#5b5d63';

const TABS = [
  { id: 'gap', title: 'פערי רווחיות לפי יזם', blurb: 'רווחיות יזם מול עירייה לכל חוות דעת, מקובצת לפי יזם, ביחס לסף.' },
  { id: 'appraisers-dev', title: 'שמאים מטעם היזם', blurb: 'ממוצע רווחיות לפי שמאי היזם. מי נוטה גבוה, מי נמוך.' },
  { id: 'appraisers-city', title: 'שמאים מטעם העירייה', blurb: 'ממוצע רווחיות לפי שמאי העירייה ובחינת עקביות.' },
  { id: 'pairs', title: 'זוגות שמאים', blurb: 'פער ממוצע לפי צמד שמאי יזם ושמאי עירייה.' },
  { id: 'turnaround', title: 'זמני טיפול', blurb: 'ימים מקבלת בקשה ועד חוות דעת, לפי שמאי העירייה.' }
];

const thresholdPlugin = (value) => ({
  id: 'threshold',
  afterDatasetsDraw(chart) {
    const y = chart.scales.y;
    if (!y || value === null) return;
    const py = y.getPixelForValue(value);
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(28,29,32,0.55)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, py);
    ctx.lineTo(chartArea.right, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(28,29,32,0.7)';
    ctx.font = "500 11px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(`${value}%`, chartArea.left + 4, py - 5);
    ctx.restore();
  }
});

function groupAvg(items, keyFn, valFn) {
  const map = new Map();
  items.forEach((d) => {
    const k = keyFn(d); const v = valFn(d);
    if (!k || v === null || v === undefined) return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  });
  return [...map.entries()].map(([name, vals]) => ({ name, avg: mean(vals), count: vals.length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

const fmt = (v) => (v === null || v === undefined ? '—' : v.toFixed(1) + '%');
const Arrow = ({ v }) => (v > PROFIT_THRESHOLD
  ? <span className="arrow arrow-up">↑</span>
  : <span className="arrow arrow-down">↓</span>);

function buildAnalysis(tab, data) {
  if (tab === 'gap') {
    const items = data.filter((d) => d.dev !== null);
    if (!items.length) return { empty: 'אין עדיין נתוני רווחיות יזם.' };
    const byDev = groupAvg(items, (d) => d.developer, (d) => d.dev);
    const labels = []; const dev = []; const city = [];
    byDev.forEach((g) => {
      const list = items.filter((d) => d.developer === g.name);
      list.forEach((d, i) => {
        labels.push(list.length > 1 ? `${g.name.slice(0, 12)} ${i + 1}` : g.name.slice(0, 16));
        dev.push(d.dev); city.push(d.city);
      });
    });
    const cityAvgs = groupAvg(items, (d) => d.developer, (d) => d.city);
    const rows = byDev.map((g) => ({ ...g, city: cityAvgs.find((c) => c.name === g.name)?.avg ?? null }));
    const sorted = rows.slice().sort((a, b) => b.avg - a.avg);
    const totalDev = mean(items.map((d) => d.dev));
    const cityVals = items.map((d) => d.city).filter((v) => v !== null);
    const totalCity = mean(cityVals);
    const datasets = [{
      label: 'רווחיות יזם (%)', data: dev,
      backgroundColor: dev.map((v) => profitColor(v)), borderRadius: 4, maxBarThickness: 26
    }];
    if (cityVals.length) datasets.push({ label: 'רווחיות עירייה (%)', data: city, backgroundColor: 'rgba(28,29,32,0.32)', borderRadius: 4, maxBarThickness: 26 });
    return {
      chart: { labels, datasets, threshold: PROFIT_THRESHOLD, legend: cityVals.length > 0 },
      summary: [
        ['חוות דעת', items.length], ['יזמים', byDev.length],
        ['ממוצע רווחיות יזם', fmt(totalDev)],
        ...(totalCity !== null ? [['ממוצע עירייה', fmt(totalCity)], ['פער ממוצע', fmt(totalDev - totalCity)]] : [])
      ],
      insights: [
        `${rows.filter((r) => r.avg > PROFIT_THRESHOLD).length} יזמים מעל סף ${PROFIT_THRESHOLD}%, ${rows.filter((r) => r.avg <= PROFIT_THRESHOLD).length} מתחת לסף.`,
        `רווחיות גבוהה ביותר: ${sorted[0].name} (${fmt(sorted[0].avg)}). נמוכה ביותר: ${sorted[sorted.length - 1].name} (${fmt(sorted[sorted.length - 1].avg)}).`,
        ...(cityVals.length ? [] : ['עמודת רווחיות עירייה ריקה עדיין. מילוי שלה יאפשר להשוות בין הערכות.'])
      ],
      details: rows.map((r) => ({ name: r.name, count: r.count, value: r.avg, extra: r.city !== null ? `עירייה ${fmt(r.city)} · פער ${fmt(r.avg - r.city)}` : '' }))
    };
  }

  if (tab === 'appraisers-dev' || tab === 'appraisers-city') {
    const isDev = tab === 'appraisers-dev';
    const rows = groupAvg(data, (d) => (isDev ? d.devAppraiser : d.cityAppraiser), (d) => (isDev ? d.dev : d.city));
    if (!rows.length) {
      return { empty: isDev ? 'אין מספיק נתונים.' : 'אין עדיין נתוני רווחיות עירייה. הגרף יוצג כשתמולא העמודה "רווחיות עירייה (%)".' };
    }
    const avgs = rows.map((r) => r.avg);
    const max = Math.max(...avgs); const min = Math.min(...avgs);
    const hi = rows[avgs.indexOf(max)]; const lo = rows[avgs.indexOf(min)];
    const spread = max - min;
    return {
      chart: {
        labels: rows.map((r) => `${r.name} (${r.count})`),
        datasets: [{ label: 'ממוצע רווחיות (%)', data: avgs, backgroundColor: avgs.map(profitColor), borderRadius: 4, maxBarThickness: 34 }],
        threshold: PROFIT_THRESHOLD
      },
      summary: [
        [isDev ? 'שמאי יזם' : 'שמאי עירייה', rows.length],
        ['חוות דעת', rows.reduce((a, r) => a + r.count, 0)],
        ['ממוצע כולל', fmt(mean(avgs))],
        ['פיזור', spread.toFixed(1) + ' נק׳']
      ],
      insights: [
        `הגבוה ביותר: ${hi.name} (${fmt(max)}, ${hi.count} חוו״ד).`,
        `הנמוך ביותר: ${lo.name} (${fmt(min)}, ${lo.count} חוו״ד).`,
        `${avgs.filter((v) => v > PROFIT_THRESHOLD).length} מתוך ${rows.length} מעל סף ${PROFIT_THRESHOLD}%.`,
        spread > 5
          ? `פיזור גבוה (${spread.toFixed(1)} נק׳). ${isDev ? 'ייתכנו הבדלים משמעותיים בגישת השומה.' : 'ייתכן חוסר עקביות בין שמאי העירייה.'}`
          : `פיזור נמוך (${spread.toFixed(1)} נק׳). עקביות טובה.`,
        'שמאי עם חוות דעת אחת או שתיים: הממוצע אינו מובהק.'
      ],
      details: rows.map((r) => ({ name: r.name, count: r.count, value: r.avg }))
    };
  }

  if (tab === 'pairs') {
    const rows = groupAvg(data, (d) => (d.devAppraiser && d.cityAppraiser ? `${d.devAppraiser} / ${d.cityAppraiser}` : null), (d) => d.gap);
    if (!rows.length) return { empty: 'אין עדיין חוות דעת עם רווחיות יזם וגם רווחיות עירייה. הניתוח יופיע ברגע שיוזנו שני הערכים באותה שורה.' };
    const gaps = rows.map((r) => r.avg);
    const proDev = gaps.filter((g) => g > 0).length;
    const absMax = rows.slice().sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg))[0];
    return {
      chart: {
        labels: rows.map((r) => r.name),
        datasets: [{ label: 'פער ממוצע (%)', data: gaps, backgroundColor: gaps.map((g) => (g > 0 ? 'rgb(180,50,40)' : 'rgb(39,150,90)')), borderRadius: 4, maxBarThickness: 34 }],
        threshold: null
      },
      summary: [['צמדים', rows.length], ['פער מוחלט ממוצע', fmt(mean(gaps.map(Math.abs)))]],
      insights: [
        `${proDev} צמדים עם פער לטובת היזם, ${rows.length - proDev} לטובת העירייה.`,
        `הפער הגדול ביותר: ${absMax.name} (${absMax.avg > 0 ? '+' : ''}${absMax.avg.toFixed(1)}%).`
      ],
      details: rows.map((r) => ({ name: r.name, count: r.count, value: r.avg, signed: true }))
    };
  }

  if (tab === 'turnaround') {
    const rows = groupAvg(data, (d) => d.cityAppraiser || 'לא צוין', (d) => d.turnaround);
    if (!rows.length) return { empty: 'אין חוות דעת עם תאריך בקשה ותאריך חוו״ד תקינים.' };
    const all = data.map((d) => d.turnaround).filter((v) => v !== null).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];
    const slow = rows.slice().sort((a, b) => b.avg - a.avg)[0];
    const fast = rows.slice().sort((a, b) => a.avg - b.avg)[0];
    return {
      chart: {
        labels: rows.map((r) => `${r.name} (${r.count})`),
        datasets: [{ label: 'ימים בממוצע', data: rows.map((r) => Math.round(r.avg)), backgroundColor: rows.map((r) => (r.avg > median ? 'rgba(28,29,32,0.78)' : 'rgba(28,29,32,0.32)')), borderRadius: 4, maxBarThickness: 34 }],
        threshold: median, unit: 'days'
      },
      summary: [['חוות דעת עם שני תאריכים', all.length], ['חציון', `${median} ימים`], ['ממוצע', `${Math.round(mean(all))} ימים`]],
      insights: [
        `האיטי ביותר בממוצע: ${slow.name} (${Math.round(slow.avg)} ימים).`,
        `המהיר ביותר בממוצע: ${fast.name} (${Math.round(fast.avg)} ימים).`,
        'הקו המקווקו מסמן את החציון הכללי. עמודות כהות: מעל החציון.'
      ],
      details: rows.map((r) => ({ name: r.name, count: r.count, value: r.avg, days: true }))
    };
  }
  return { empty: '' };
}

export default function Analytics({ ctx, tab }) {
  const data = useMemo(() => flatOpinions(ctx.data.projects), [ctx.data.projects]);
  const current = TABS.find((t) => t.id === tab);
  if (!current) return <Menu data={data} />;
  return <ChartPage tab={current} data={data} />;
}

function Menu({ data }) {
  const withDev = data.filter((d) => d.dev !== null).length;
  const figures = {
    gap: `${withDev} חוו״ד עם רווחיות`,
    'appraisers-dev': `${new Set(data.map((d) => d.devAppraiser).filter(Boolean)).size} שמאים`,
    'appraisers-city': `${new Set(data.map((d) => d.cityAppraiser).filter(Boolean)).size} שמאים`,
    pairs: `${data.filter((d) => d.gap !== null).length} השוואות`,
    turnaround: `${data.filter((d) => d.turnaround !== null).length} מדידות`
  };
  return (
    <div className="page">
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">ניתוח נתונים</span>
          <h1 className="display-l">חמש קריאות<br /><span className="thin">של אותו מאגר</span></h1>
        </div>
      </section>
      <div className="analysis-grid">
        {TABS.map((t, i) => (
          <motion.a
            key={t.id}
            href={`#/a/${t.id}`}
            className="analysis-card"
            initial={{ opacity: 0, y: 24, rotateX: 12 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            whileHover={{ y: -6 }}
            transition={{ duration: 0.55, delay: i * 0.07, ease }}
          >
            <span className="analysis-index mono">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="analysis-title">{t.title}</h3>
            <p>{t.blurb}</p>
            <span className="label">{figures[t.id]}</span>
          </motion.a>
        ))}
      </div>
    </div>
  );
}

function ChartPage({ tab, data }) {
  const canvasRef = useRef(null);
  const analysis = useMemo(() => buildAnalysis(tab.id, data), [tab.id, data]);

  useEffect(() => {
    if (!analysis.chart || !canvasRef.current) return undefined;
    const { labels, datasets, threshold, legend, unit } = analysis.chart;
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: !!legend, position: 'top', rtl: true, labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            rtl: true,
            backgroundColor: '#1c1d20',
            padding: 10,
            callbacks: {
              label: (c) => (c.parsed.y === null ? 'אין נתון'
                : unit === 'days' ? `${c.parsed.y} ימים` : `${c.dataset.label}: ${c.parsed.y > 0 && tab.id === 'pairs' ? '+' : ''}${c.parsed.y.toFixed(1)}%`)
            }
          }
        },
        scales: {
          x: { reverse: true, grid: { display: false }, ticks: { maxRotation: 60, autoSkip: false, font: { size: 10 } } },
          y: { position: 'right', beginAtZero: true, grid: { color: 'rgba(28,29,32,0.06)' }, border: { display: false } }
        }
      },
      plugins: [thresholdPlugin(threshold)]
    });
    return () => chart.destroy();
  }, [analysis, tab.id]);

  return (
    <div className="page">
      <a className="back" href="#/a">חזרה לניתוחים</a>
      <section className="hero hero-compact">
        <div className="hero-text">
          <span className="label">ניתוח</span>
          <h1 className="display-l">{tab.title}</h1>
          <p className="lead">{tab.blurb}</p>
        </div>
      </section>
      {analysis.empty ? (
        <div className="state-card"><p>{analysis.empty}</p></div>
      ) : (
        <>
          <section className="panel chart-panel">
            <div className="chart-box"><canvas ref={canvasRef} aria-label={tab.title} role="img" /></div>
          </section>
          <section className="insight-grid">
            <div className="panel">
              <span className="label">סיכום</span>
              <dl className="summary">
                {analysis.summary.map(([k, v]) => (
                  <div key={k}><dt className="label">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <span className="label">תובנות</span>
              <ul className="insights">
                {analysis.insights.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <div className="panel">
              <span className="label">פירוט</span>
              <ul className="details">
                {analysis.details.map((d) => (
                  <li key={d.name}>
                    <span className="strong">{d.name}</span>
                    <span className="muted">{d.count} חוו״ד{d.extra ? ` · ${d.extra}` : ''}</span>
                    <span className="mono details-value">
                      {d.days ? `${Math.round(d.value)} ימים`
                        : d.signed ? `${d.value > 0 ? '+' : ''}${d.value.toFixed(1)}%`
                        : <>{fmt(d.value)} <Arrow v={d.value} /></>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
