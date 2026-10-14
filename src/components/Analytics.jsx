import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js';
import { flatOpinions, formatDuration, gapColor, mean, profitColor } from '../lib/calc.js';
import { PROFIT_THRESHOLD } from '../lib/config.js';
import { ease } from './ui.jsx';
import { BenchmarkLegend, GapLegend } from './Legend.jsx';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
Chart.defaults.font.family = "'IBM Plex Sans Hebrew', system-ui, sans-serif";
Chart.defaults.color = '#5b5d63';

const fmt = (v) => (v === null || v === undefined ? '—' : v.toFixed(1) + '%');
const dateOf = (d) => d.got || d.req;
const dstr = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : 'ללא תאריך');

const WHAT = {
  profit: <>
    <b>רווחיות יזם</b> היא שיעור הרווח של היזם לפי <b>הדוח הכלכלי שהגיש שמאי היזם</b>. <b>רווחיות עירייה</b> היא שיעור הרווח לפי <b>בדיקת שמאי העירייה</b> לאותו דוח.
    העמודות מציגות את <b>אחוז הרווח עצמו</b>, לא את הפער. הצבע מציין סיכון ביחס לבנצ'מרק {PROFIT_THRESHOLD}%: ירוק מתחת לו, אדום מעליו, וככל שהגוון עמוק יותר המרחק מהבנצ'מרק גדול יותר.
  </>,
  gap: <>
    <b>הפער</b> הוא ההפרש בנקודות אחוז בין רווחיות היזם לרווחיות שקבע שמאי העירייה באותה חוות דעת. פער חיובי: היזם מעריך רווח גבוה יותר מהעירייה. פער שלילי: העירייה מעריכה גבוה יותר.
    כאן הסיכון הוא <b>גודל המחלוקת</b> לכל כיוון, ולכן הצבע נקבע לפי הערך המוחלט של הפער.
  </>,
  turnaround: <>
    <b>זמן טיפול</b> הוא מספר הימים מתאריך קבלת הבקשה ועד תאריך קבלת חוות הדעת. העמודות הכהות מעל החציון, הקו המקווקו הוא החציון.
  </>
};

const TABS = [
  { id: 'gap', title: 'רווחיות לפי יזם', blurb: 'אחוז הרווח בכל חוות דעת, יזם מול עירייה, מקובץ ומסומן לפי יזם.', what: 'profit', legend: 'profit',
    sorts: [['group', 'לפי יזם'], ['desc', 'מהגבוה לנמוך'], ['asc', 'מהנמוך לגבוה'], ['date', 'לפי תאריך חוו״ד'], ['quarter', 'לפי רובע']] },
  { id: 'appraisers-dev', title: 'שמאים מטעם היזם', blurb: 'ממוצע הרווחיות בדוחות של כל שמאי יזם.', what: 'profit', legend: 'profit',
    sorts: [['desc', 'מהגבוה לנמוך'], ['asc', 'מהנמוך לגבוה'], ['count', 'לפי מספר חוו״ד'], ['abc', 'לפי א–ב']] },
  { id: 'appraisers-city', title: 'שמאים מטעם העירייה', blurb: 'ממוצע הרווחיות שקבע כל שמאי עירייה.', what: 'profit', legend: 'profit',
    sorts: [['desc', 'מהגבוה לנמוך'], ['asc', 'מהנמוך לגבוה'], ['count', 'לפי מספר חוו״ד'], ['abc', 'לפי א–ב']] },
  { id: 'pairs', title: 'פער לפי זוג שמאים', blurb: 'הפער הממוצע בין שמאי היזם לשמאי העירייה, לכל צמד.', what: 'gap', legend: 'gap',
    sorts: [['abs', 'לפי גודל הפער'], ['desc', 'מהגבוה לנמוך'], ['asc', 'מהנמוך לגבוה'], ['count', 'לפי מספר חוו״ד']] },
  { id: 'turnaround', title: 'זמני טיפול', blurb: 'משך הזמן מבקשה ועד חוות דעת, לפי שמאי העירייה.', what: 'turnaround', legend: 'none',
    sorts: [['desc', 'האיטי ביותר קודם'], ['asc', 'המהיר ביותר קודם'], ['count', 'לפי מספר חוו״ד'], ['abc', 'לפי א–ב']] }
];

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((d) => { const k = keyFn(d); if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k).push(d); });
  return [...map.entries()].map(([name, list]) => ({ name, list }));
}

function sortRows(rows, mode, val = (r) => r.value) {
  const out = rows.slice();
  if (mode === 'desc') out.sort((a, b) => val(b) - val(a));
  else if (mode === 'asc') out.sort((a, b) => val(a) - val(b));
  else if (mode === 'count') out.sort((a, b) => b.list.length - a.list.length);
  else if (mode === 'abs') out.sort((a, b) => Math.abs(val(b)) - Math.abs(val(a)));
  else out.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return out;
}

// Soft rounded frame behind each developer's run of bars.
const groupFramePlugin = (groups) => ({
  id: 'groupFrames',
  beforeDatasetsDraw(chart) {
    if (!groups || !groups.length) return;
    const { ctx, chartArea, scales: { x } } = chart;
    const step = x.width / Math.max(1, x.ticks.length);
    ctx.save();
    groups.forEach((g, gi) => {
      const a = x.getPixelForValue(g.start);
      const b = x.getPixelForValue(g.end);
      const left = Math.min(a, b) - step * 0.46;
      const right = Math.max(a, b) + step * 0.46;
      const top = chartArea.top + 2;
      const h = chartArea.bottom - top;
      ctx.fillStyle = gi % 2 ? 'rgba(28,29,32,0.035)' : 'rgba(28,29,32,0.018)';
      ctx.strokeStyle = 'rgba(28,29,32,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left, top, right - left, h, 8);
      ctx.fill();
      ctx.stroke();
      if (right - left > 34) {
        ctx.fillStyle = 'rgba(28,29,32,0.72)';
        ctx.font = "500 10.5px 'IBM Plex Sans Hebrew', sans-serif";
        ctx.textAlign = 'center';
        const name = g.name.length > 14 ? g.name.slice(0, 13) + '…' : g.name;
        ctx.fillText(name, (left + right) / 2, top + 13);
      }
    });
    ctx.restore();
  }
});

const thresholdPlugin = (value, label) => ({
  id: 'threshold',
  afterDatasetsDraw(chart) {
    const y = chart.scales.y;
    if (!y || value === null || value === undefined) return;
    const py = y.getPixelForValue(value);
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(28,29,32,0.6)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, py);
    ctx.lineTo(chartArea.right, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(28,29,32,0.85)';
    ctx.font = "500 11px 'IBM Plex Sans Hebrew', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(label, chartArea.left + 6, py - 6);
    ctx.restore();
  }
});

function buildAnalysis(tab, data, sort) {
  if (tab === 'gap') {
    const items = data.filter((d) => d.dev !== null);
    if (!items.length) return { empty: 'אין עדיין נתוני רווחיות יזם.' };
    const devGroups = groupBy(items, (d) => d.developer).map((g) => ({
      ...g,
      value: mean(g.list.map((d) => d.dev)),
      city: mean(g.list.map((d) => d.city).filter((v) => v !== null)),
      list: g.list.slice().sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0))
    }));
    let ordered; let frames = null;
    if (sort === 'group') {
      const gs = devGroups.sort((a, b) => a.name.localeCompare(b.name, 'he'));
      ordered = []; frames = [];
      gs.forEach((g) => { frames.push({ name: g.name, start: ordered.length, end: ordered.length + g.list.length - 1 }); ordered.push(...g.list); });
    } else if (sort === 'desc') ordered = items.slice().sort((a, b) => b.dev - a.dev);
    else if (sort === 'asc') ordered = items.slice().sort((a, b) => a.dev - b.dev);
    else if (sort === 'date') ordered = items.slice().sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0));
    else {
      const gs = groupBy(items, (d) => `רובע ${d.quarter || '—'}`).sort((a, b) => a.name.localeCompare(b.name, 'he'));
      ordered = []; frames = [];
      gs.forEach((g) => { frames.push({ name: g.name, start: ordered.length, end: ordered.length + g.list.length - 1 }); ordered.push(...g.list); });
    }
    const labels = ordered.map((d) => (sort === 'group' ? `${d.plan.slice(0, 12)} ${dateOf(d) ? dateOf(d).getFullYear() : ''}` : `${d.developer.slice(0, 10)} · ${d.plan.slice(0, 10)}`));
    const dev = ordered.map((d) => d.dev);
    const city = ordered.map((d) => d.city);
    const cityVals = city.filter((v) => v !== null);
    const datasets = [{ label: 'רווחיות לפי דוח היזם', data: dev, backgroundColor: dev.map(profitColor), borderRadius: 4, maxBarThickness: 26 }];
    if (cityVals.length) datasets.push({ label: 'רווחיות לפי שמאי העירייה', data: city, backgroundColor: city.map((v) => profitColor(v).replace('rgb', 'rgba').replace(')', ',0.45)')), borderColor: city.map(profitColor), borderWidth: 1.5, borderRadius: 4, maxBarThickness: 26 });
    const sorted = devGroups.slice().sort((a, b) => b.value - a.value);
    return {
      chart: { labels, datasets, threshold: PROFIT_THRESHOLD, thresholdLabel: `בנצ'מרק ${PROFIT_THRESHOLD}%`, legend: true, frames, xTitle: sort === 'group' ? 'חוות דעת, מקובצות לפי יזם (שם הפרויקט ושנה)' : 'חוות דעת (יזם · פרויקט)', yTitle: 'שיעור רווחיות (%)' },
      summary: [
        ['חוות דעת עם רווחיות', items.length], ['יזמים', devGroups.length],
        ['ממוצע רווחיות לפי היזם', fmt(mean(items.map((d) => d.dev)))],
        ['ממוצע רווחיות לפי העירייה', cityVals.length ? fmt(mean(cityVals)) : 'טרם הוזן']
      ],
      insights: [
        `${devGroups.filter((r) => r.value > PROFIT_THRESHOLD).length} יזמים בממוצע מעל הבנצ'מרק (אדום), ${devGroups.filter((r) => r.value <= PROFIT_THRESHOLD).length} עד הבנצ'מרק (ירוק).`,
        `הרווחיות הממוצעת הגבוהה ביותר: ${sorted[0].name} (${fmt(sorted[0].value)}). הנמוכה ביותר: ${sorted[sorted.length - 1].name} (${fmt(sorted[sorted.length - 1].value)}).`,
        ...(cityVals.length ? [] : ['עמודת רווחיות העירייה עדיין ריקה. כשתמולא, תופיע לצד כל עמודת יזם עמודה בהירה של העירייה ויחושב הפער.'])
      ],
      details: sortRows(devGroups, 'desc'),
      detailKind: 'developer'
    };
  }

  if (tab === 'appraisers-dev' || tab === 'appraisers-city') {
    const isDev = tab === 'appraisers-dev';
    const rows = groupBy(data.filter((d) => (isDev ? d.dev : d.city) !== null), (d) => (isDev ? d.devAppraiser : d.cityAppraiser))
      .map((g) => ({ ...g, value: mean(g.list.map((d) => (isDev ? d.dev : d.city))), list: g.list.slice().sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0)) }));
    if (!rows.length) {
      return { empty: isDev ? 'אין מספיק נתונים.' : 'אין עדיין נתוני רווחיות עירייה. הניתוח יוצג כשתמולא העמודה "רווחיות עירייה (%)" בחוות הדעת.' };
    }
    const ordered = sortRows(rows, sort);
    const avgs = rows.map((r) => r.value);
    const max = Math.max(...avgs); const min = Math.min(...avgs);
    const hi = rows.find((r) => r.value === max); const lo = rows.find((r) => r.value === min);
    const spread = max - min;
    return {
      chart: {
        labels: ordered.map((r) => `${r.name} (${r.list.length})`),
        datasets: [{ label: 'ממוצע רווחיות', data: ordered.map((r) => r.value), backgroundColor: ordered.map((r) => profitColor(r.value)), borderRadius: 4, maxBarThickness: 34 }],
        threshold: PROFIT_THRESHOLD, thresholdLabel: `בנצ'מרק ${PROFIT_THRESHOLD}%`,
        xTitle: isDev ? 'שמאי מטעם היזם (מספר חוות דעת)' : 'שמאי מטעם העירייה (מספר חוות דעת)', yTitle: 'ממוצע שיעור רווחיות (%)'
      },
      summary: [
        [isDev ? 'שמאי יזם' : 'שמאי עירייה', rows.length],
        ['חוות דעת', rows.reduce((a, r) => a + r.list.length, 0)],
        ['ממוצע כולל', fmt(mean(avgs))],
        ['פיזור בין שמאים', spread.toFixed(1) + ' נק׳']
      ],
      insights: [
        `הגבוה ביותר: ${hi.name} (${fmt(max)}, ${hi.list.length} חוו״ד).`,
        `הנמוך ביותר: ${lo.name} (${fmt(min)}, ${lo.list.length} חוו״ד).`,
        `${avgs.filter((v) => v > PROFIT_THRESHOLD).length} מתוך ${rows.length} מעל הבנצ'מרק.`,
        spread > 5
          ? `פיזור גבוה (${spread.toFixed(1)} נק׳). ${isDev ? 'ייתכנו הבדלים בגישת השומה בין שמאי היזמים.' : 'ייתכן חוסר עקביות בין שמאי העירייה.'}`
          : `פיזור נמוך (${spread.toFixed(1)} נק׳). עקביות טובה.`,
        'שמאי עם חוות דעת אחת או שתיים: הממוצע אינו מובהק.'
      ],
      details: sortRows(rows, 'desc'),
      detailKind: 'appraiser'
    };
  }

  if (tab === 'pairs') {
    const rows = groupBy(data.filter((d) => d.gap !== null), (d) => (d.devAppraiser && d.cityAppraiser ? `${d.devAppraiser} / ${d.cityAppraiser}` : null))
      .map((g) => ({ ...g, value: mean(g.list.map((d) => d.gap)) }));
    if (!rows.length) return { empty: 'אין עדיין חוות דעת עם רווחיות יזם וגם רווחיות עירייה באותה שורה. הניתוח יופיע כשיוזנו שני הערכים.' };
    const ordered = sortRows(rows, sort);
    return {
      chart: {
        labels: ordered.map((r) => r.name),
        datasets: [{ label: 'פער ממוצע (נקודות אחוז)', data: ordered.map((r) => r.value), backgroundColor: ordered.map((r) => gapColor(r.value)), borderRadius: 4, maxBarThickness: 34 }],
        threshold: 0, thresholdLabel: 'אין פער',
        xTitle: 'שמאי יזם / שמאי עירייה', yTitle: 'פער ממוצע: יזם פחות עירייה (נק׳)', allowNegative: true
      },
      summary: [['צמדים', rows.length], ['פער מוחלט ממוצע', mean(rows.map((r) => Math.abs(r.value))).toFixed(1) + ' נק׳']],
      insights: [`${rows.filter((r) => r.value > 0).length} צמדים בהם היזם מעריך רווח גבוה יותר, ${rows.filter((r) => r.value <= 0).length} בהם העירייה מעריכה גבוה יותר.`],
      details: sortRows(rows, 'abs'),
      detailKind: 'pair'
    };
  }

  if (tab === 'turnaround') {
    const rows = groupBy(data.filter((d) => d.turnaround !== null), (d) => d.cityAppraiser || 'לא צוין')
      .map((g) => ({ ...g, value: mean(g.list.map((d) => d.turnaround)), list: g.list.slice().sort((a, b) => (dateOf(a)?.getTime() || 0) - (dateOf(b)?.getTime() || 0)) }));
    if (!rows.length) return { empty: 'אין חוות דעת עם תאריך בקשה ותאריך חוו״ד תקינים.' };
    const all = data.map((d) => d.turnaround).filter((v) => v !== null).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];
    const ordered = sortRows(rows, sort);
    const slow = sortRows(rows, 'desc')[0];
    const fast = sortRows(rows, 'asc')[0];
    return {
      chart: {
        labels: ordered.map((r) => `${r.name} (${r.list.length})`),
        datasets: [{ label: 'ימים בממוצע', data: ordered.map((r) => Math.round(r.value)), backgroundColor: ordered.map((r) => (r.value > median ? 'rgba(28,29,32,0.78)' : 'rgba(28,29,32,0.3)')), borderRadius: 4, maxBarThickness: 34 }],
        threshold: median, thresholdLabel: `חציון ${formatDuration(median)}`, unit: 'days',
        xTitle: 'שמאי מטעם העירייה (מספר חוות דעת)', yTitle: 'ימים מבקשה ועד חוות דעת'
      },
      summary: [['מדידות', all.length], ['חציון', formatDuration(median)], ['ממוצע', formatDuration(Math.round(mean(all)))]],
      insights: [
        `האיטי ביותר בממוצע: ${slow.name} (${formatDuration(Math.round(slow.value))}).`,
        `המהיר ביותר בממוצע: ${fast.name} (${formatDuration(Math.round(fast.value))}).`
      ],
      details: sortRows(rows, 'desc'),
      detailKind: 'turnaround'
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
      <BenchmarkLegend />
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
  const [sort, setSort] = useState(tab.sorts[0][0]);
  const [open, setOpen] = useState(null);
  const analysis = useMemo(() => buildAnalysis(tab.id, data, sort), [tab.id, data, sort]);

  useEffect(() => {
    if (!analysis.chart || !canvasRef.current) return undefined;
    const { labels, datasets, threshold, thresholdLabel, legend, unit, frames, xTitle, yTitle, allowNegative } = analysis.chart;
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: frames ? 18 : 6 } },
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            display: !!legend, position: 'top', rtl: true,
            labels: {
              boxWidth: 14, boxHeight: 14, padding: 16,
              // Bar colour encodes risk, so the legend swatch only distinguishes the two sources.
              generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
                text: ds.label,
                fillStyle: i === 0 ? 'rgba(28,29,32,0.7)' : 'rgba(28,29,32,0.12)',
                strokeStyle: 'rgba(28,29,32,0.7)',
                lineWidth: i === 0 ? 0 : 1.5,
                datasetIndex: i,
                hidden: !chart.isDatasetVisible(i)
              }))
            }
          },
          tooltip: {
            rtl: true,
            backgroundColor: '#1c1d20',
            padding: 10,
            callbacks: {
              label: (c) => (c.parsed.y === null ? `${c.dataset.label}: אין נתון`
                : unit === 'days' ? `${formatDuration(c.parsed.y)}`
                : `${c.dataset.label}: ${allowNegative && c.parsed.y > 0 ? '+' : ''}${c.parsed.y.toFixed(1)}${allowNegative ? ' נק׳' : '%'}`)
            }
          }
        },
        scales: {
          x: { reverse: true, grid: { display: false }, ticks: { maxRotation: 60, autoSkip: false, font: { size: 10 } },
            title: { display: true, text: xTitle, font: { size: 12, weight: '500' }, color: '#33353a' } },
          y: { position: 'right', beginAtZero: true, grid: { color: 'rgba(28,29,32,0.06)' }, border: { display: false },
            title: { display: true, text: yTitle, font: { size: 12, weight: '500' }, color: '#33353a' } }
        }
      },
      plugins: [groupFramePlugin(frames), thresholdPlugin(threshold, thresholdLabel)]
    });
    return () => chart.destroy();
  }, [analysis]);

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
      <section className="panel what-panel">
        <span className="label">מה מוצג כאן</span>
        <p>{WHAT[tab.what]}</p>
        {tab.legend === 'profit' && <BenchmarkLegend />}
        {tab.legend === 'gap' && <GapLegend />}
      </section>
      {analysis.empty ? (
        <div className="state-card"><p>{analysis.empty}</p></div>
      ) : (
        <>
          <section className="panel chart-panel">
            <div className="chart-toolbar">
              <span className="label">סידור הגרף</span>
              <div className="seg-control" role="radiogroup" aria-label="סידור הגרף">
                {tab.sorts.map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={sort === v} className={sort === v ? 'on' : ''} onClick={() => setSort(v)}>{l}</button>
                ))}
              </div>
            </div>
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
              <span className="label">פירוט · לחיצה על שורה פותחת את חוות הדעת לפי תאריך</span>
              <ul className="details">
                {analysis.details.map((d) => (
                  <DetailRow key={d.name} d={d} kind={analysis.detailKind} open={open === d.name} onToggle={() => setOpen(open === d.name ? null : d.name)} />
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Arrow({ v }) {
  return v > PROFIT_THRESHOLD
    ? <span className="arrow arrow-up" title="מעל הבנצ'מרק">↑</span>
    : <span className="arrow arrow-down" title="עד הבנצ'מרק">↓</span>;
}

function DetailRow({ d, kind, open, onToggle }) {
  const value = kind === 'turnaround' ? formatDuration(Math.round(d.value))
    : kind === 'pair' ? <><bdi dir="ltr">{`${d.value > 0 ? '+' : ''}${d.value.toFixed(1)}`}</bdi> נק׳</>
    : fmt(d.value);
  const color = kind === 'turnaround' ? undefined : kind === 'pair' ? gapColor(d.value) : profitColor(d.value);
  const trend = d.list.filter((x) => x.dev !== null).map((x) => x.dev);
  const delta = trend.length > 1 ? trend[trend.length - 1] - trend[0] : null;
  return (
    <li className={`detail${open ? ' detail-open' : ''}`}>
      <button className="detail-head" onClick={onToggle} aria-expanded={open}>
        <span className="detail-caret" aria-hidden="true">{open ? '−' : '+'}</span>
        <span className="strong">{d.name}</span>
        <span className="muted detail-meta">
          {d.list.length} חוו״ד · ממוצע{kind === 'developer' && delta !== null ? ` · מגמה ${delta > 0 ? 'עלייה' : delta < 0 ? 'ירידה' : 'יציבה'} ${Math.abs(delta).toFixed(1)} נק׳ מהראשונה לאחרונה` : ''}
        </span>
        <span className="mono details-value" style={{ color }}>
          {value} {kind !== 'turnaround' && kind !== 'pair' && <Arrow v={d.value} />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol className="detail-list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }}>
            {d.list.map((x) => (
              <li key={x.opinionId}>
                <span className="mono detail-date">{dstr(dateOf(x))}</span>
                <a className="project-name" href={`#/p/${x.projectId}`}>{x.plan || x.address}</a>
                {kind !== 'developer' && <span className="muted">יזם: {x.developer}</span>}
                <span className="detail-pair">
                  <span><span className="role">יזם</span> <b style={{ color: profitColor(x.dev) }}>{fmt(x.dev)}</b></span>
                  <span><span className="role">עירייה</span> <b style={{ color: profitColor(x.city) }}>{fmt(x.city)}</b></span>
                  {x.gap !== null && <span><span className="role">פער</span> <b dir="ltr" style={{ color: gapColor(x.gap) }}>{x.gap > 0 ? '+' : ''}{x.gap.toFixed(1)}</b></span>}
                  {kind === 'turnaround' && x.turnaround !== null && <span><span className="role">משך</span> <b>{formatDuration(x.turnaround)}</b></span>}
                </span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </li>
  );
}
