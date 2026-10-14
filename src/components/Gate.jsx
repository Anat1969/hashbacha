import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { ease } from './ui.jsx';

export default function Gate({ onEnter }) {
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle'); // idle | checking | wrong | offline

  async function submit(e) {
    e.preventDefault();
    const k = code.trim().toUpperCase();
    if (!k) return;
    setState('checking');
    try {
      const ok = await api.check(k);
      if (ok) onEnter(k);
      else setState('wrong');
    } catch {
      setState('offline');
    }
  }

  return (
    <div className="gate">
      <div className="backdrop" aria-hidden="true">
        <div className="grid-plane" />
        <div className="glow glow-a" />
        <div className="glow glow-b" />
      </div>
      <div className="gate-stage">
        <motion.div
          className="gate-towers"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
        >
          {[38, 62, 88, 54, 72].map((h, i) => (
            <motion.span
              key={i}
              style={{ height: h + '%' }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.1, delay: 0.15 + i * 0.09, ease }}
            />
          ))}
        </motion.div>
        <motion.form
          className="gate-card"
          onSubmit={submit}
          initial={{ opacity: 0, y: 30, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.2 }}
        >
          <span className="label">אגף השבחה · עיריית אשדוד</span>
          <h1 className="display-xl">השבחה</h1>
          <p className="lead">מעקב פרויקטי פינוי־בינוי, בקשות וחוות דעת שמאיות. מאגר אחד, משותף ומאובטח.</p>
          <label className="field">
            <span className="label">קוד גישה</span>
            <input
              className="input input-code"
              dir="ltr"
              autoComplete="off"
              spellCheck="false"
              placeholder="HB-XXXX-XXXX-XXXX"
              value={code}
              onChange={(e) => { setCode(e.target.value); setState('idle'); }}
              aria-invalid={state === 'wrong'}
            />
          </label>
          <button className="btn btn-primary btn-wide" disabled={state === 'checking'}>
            {state === 'checking' ? 'בודק…' : 'כניסה'}
          </button>
          <p className={`gate-msg gate-msg-${state}`} role="status">
            {state === 'wrong' && 'הקוד שגוי. בדקו את האותיות ונסו שוב.'}
            {state === 'offline' && 'אין חיבור לשרת. נסו שוב בעוד רגע.'}
            {(state === 'idle' || state === 'checking') && 'הקוד נשמר בדפדפן זה בלבד, ונדרש פעם אחת.'}
          </p>
        </motion.form>
      </div>
    </div>
  );
}
