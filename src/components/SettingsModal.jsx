import React, { useEffect, useState } from 'react';
import { Modal, Field } from './ui.jsx';
import { api } from '../lib/api.js';
import { KEY_STORAGE } from '../lib/config.js';

function entryLink() {
  let k = '';
  try { k = localStorage.getItem(KEY_STORAGE) || ''; } catch { /* storage blocked */ }
  return k ? `${window.location.origin}/?k=${encodeURIComponent(k)}` : '';
}

export default function SettingsModal({ open, onClose, ctx, onLogout }) {
  const [form, setForm] = useState({ ilanitEmail: '', planningEmail: '' });
  const [copied, setCopied] = useState(false);
  const link = open ? entryLink() : '';

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { ctx.toast('לא ניתן להעתיק אוטומטית. סמני את הקישור והעתיקי ידנית.', 'error'); }
  }
  useEffect(() => {
    if (open) setForm({ ilanitEmail: '', planningEmail: '', ...(ctx.data?.settings || {}) });
  }, [open, ctx.data]);

  async function save() {
    const res = await ctx.mutate((k) => api.saveSettings(k, form), 'ההגדרות נשמרו');
    if (res !== null) onClose();
  }

  return (
    <Modal
      open={open}
      title="הגדרות"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-primary" onClick={save}>שמור</button>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <span className="spacer" />
          <button className="btn btn-ghost btn-quiet" onClick={onLogout}>יציאה מהמערכת</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="מייל אילנית · פרויקט חדש">
          <input className="input" dir="ltr" type="email" value={form.ilanitEmail || ''}
            onChange={(e) => setForm({ ...form, ilanitEmail: e.target.value })} />
        </Field>
        <Field label="מייל אגף תכנון · חוו״ד מוכנה">
          <input className="input" dir="ltr" type="email" value={form.planningEmail || ''}
            onChange={(e) => setForm({ ...form, planningEmail: e.target.value })} />
        </Field>
      </div>
      <p className="hint">כתובות אלה ממולאות אוטומטית בטיוטות המייל שנפתחות מדף הפרויקט.</p>
      {link && (
        <div className="share">
          <span className="label">קישור כניסה לשיתוף</span>
          <p className="hint">מי שפותח את הקישור נכנס מיד, בלי להקליד קוד. לשלוח רק לצוות.</p>
          <div className="share-row">
            <input className="input mono" dir="ltr" readOnly value={link} aria-label="קישור כניסה" onFocus={(e) => e.target.select()} />
            <button className="btn btn-ghost" onClick={copyLink}>{copied ? 'הועתק' : 'העתק'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
