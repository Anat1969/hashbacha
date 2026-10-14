import React from 'react';
import { PROFIT_THRESHOLD } from '../lib/config.js';
import { GAP_ALERT, gapColor, profitColor } from '../lib/calc.js';

// The benchmark as a reference line for both numbers and colours.
export function BenchmarkLegend({ compact }) {
  const stops = [0, 5, 10, 15, 18, 21, 25].map((v) => `${profitColor(v)} ${(v / 25) * 100}%`).join(', ');
  return (
    <div className={`legend${compact ? ' legend-compact' : ''}`}>
      <span className="label">מקרא רווחיות</span>
      <div className="legend-scale">
        <span className="legend-bar" style={{ background: `linear-gradient(to left, ${stops})` }} />
        <span className="legend-mark" style={{ right: `${(PROFIT_THRESHOLD / 25) * 100}%` }}>
          <i />
          <b>בנצ'מרק {PROFIT_THRESHOLD}%</b>
        </span>
      </div>
      <div className="legend-ends">
        <span><span className="arrow arrow-down">↓</span> מתחת לבנצ'מרק: ירוק, תקין</span>
        <span>מעל הבנצ'מרק: אדום, דורש בחינה <span className="arrow arrow-up">↑</span></span>
      </div>
    </div>
  );
}

export function GapLegend() {
  const stops = [0, 1.5, 3, 5, 8].map((v) => `${gapColor(v)} ${(v / 8) * 100}%`).join(', ');
  return (
    <div className="legend">
      <span className="label">מקרא פער (יזם מול עירייה)</span>
      <div className="legend-scale">
        <span className="legend-bar" style={{ background: `linear-gradient(to left, ${stops})` }} />
        <span className="legend-mark" style={{ right: `${(GAP_ALERT / 8) * 100}%` }}>
          <i />
          <b>סף פער {GAP_ALERT} נק׳</b>
        </span>
      </div>
      <div className="legend-ends">
        <span>פער קטן: הערכות קרובות</span>
        <span>פער גדול, לכל כיוון: דורש בירור</span>
      </div>
    </div>
  );
}
