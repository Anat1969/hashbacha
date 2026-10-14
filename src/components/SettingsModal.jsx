import React, { useEffect, useState } from 'react';
import { Modal, Field } from './ui.jsx';
import { api } from '../lib/api.js';

export default function SettingsModal({ open, onClose, ctx, onLogout }) {
  const [form, setForm] = useState({ ilanitEmail: '', planningEmail: '' });
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
    </Modal>
  );
}
