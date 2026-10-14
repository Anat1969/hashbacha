import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STATUS_OPTIONS } from '../lib/fields.js';
import { profitColor } from '../lib/calc.js';

export const ease = [0.22, 1, 0.36, 1];

export function StatusPill({ value }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === (value || '')) || STATUS_OPTIONS[0];
  return <span className={`pill pill-${opt.tone}`}>{value ? opt.label : '—'}</span>;
}

export function ProfitMeter({ value }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  const w = Math.max(4, Math.min(100, (value / 30) * 100));
  return (
    <span className="meter" title={`${value.toFixed(1)}%`}>
      <span className="meter-num" style={{ color: profitColor(value) }}>{value.toFixed(1)}%</span>
      <span className="meter-track">
        <span className="meter-mark" />
        <motion.span
          className="meter-fill"
          style={{ background: profitColor(value) }}
          initial={{ width: 0 }}
          animate={{ width: w + '%' }}
          transition={{ duration: 0.8, ease }}
        />
      </span>
    </span>
  );
}

export function Modal({ open, title, onClose, children, actions, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className={`modal${wide ? ' modal-wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 28, opacity: 0, scale: 0.97, rotateX: 6 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease }}
          >
            <div className="modal-head">
              <span className="label">{title}</span>
            </div>
            <div className="modal-body">{children}</div>
            {actions && <div className="modal-actions">{actions}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts({ items }) {
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.tone || 'info'}`}
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            {t.text}
            {t.action && (
              <button className="toast-action" onClick={t.action.onClick}>{t.action.label}</button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Field({ label, children, wide }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
