import React, { useEffect, useState } from 'react';
import { Modal, Field } from './ui.jsx';
import { api } from '../lib/api.js';
import { KEY_STORAGE } from '../lib/config.js';
import { CONTACT_ROLES } from '../lib/fields.js';

function entryLink() {
  let k = '';
  try { k = localStorage.getItem(KEY_STORAGE) || ''; } catch { /* storage blocked */ }
  return k ? `${window.location.origin}/?k=${encodeURIComponent(k)}` : '';
}

export default function SettingsModal({ open, onClose, ctx, onLogout }) {
  const [form, setForm] = useState({ ilanitEmail: '', planningEmail: '', contacts: [] });
  const [copied, setCopied] = useState(false);
  const link = open ? entryLink() : '';

  useEffect(() => {
    if (open) setForm({ ilanitEmail: '', planningEmail: '', contacts: [], ...(ctx.data?.settings || {}) });
  }, [open, ctx.data]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { ctx.toast('לא ניתן להעתיק אוטומטית. סמני את הקישור והעתיקי ידנית.', 'error'); }
  }

  async function save() {
    const contacts = (form.contacts || []).filter((c) => c.name.trim() || c.email.trim());
    const res = await ctx.mutate((k) => api.saveSettings(k, { ...form, contacts }), 'ההגדרות נשמרו');
    if (res !== null) onClose();
  }

  const setContact = (i, patch) => setForm({ ...form, contacts: form.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const addContact = () => setForm({ ...form, contacts: [...(form.contacts || []), { name: '', role: 'שמאי עירייה', email: '' }] });
  const removeContact = (i) => setForm({ ...form, contacts: form.contacts.filter((_, j) => j !== i) });

  return (
    <Modal
      open={open}
      title="הגדרות"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn btn-primary" onClick={save}>שמור</button>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <span className="spacer" />
          <button className="btn btn-ghost btn-quiet" onClick={onLogout}>יציאה מהמערכת</button>
        </>
      }
    >
      <section className="settings-block">
        <h3 className="settings-title">כתובות לטיוטות המייל</h3>
        <p className="hint">
          כשלוחצים בכרטיס פרויקט על אחד מכפתורי המייל, נפתחת טיוטה מוכנה לעריכה. הכתובות שכאן ממולאות בה אוטומטית בשדה "אל",
          כדי שלא תצטרכי להקליד אותן בכל פעם. לא נשלח שום מייל בלי שתלחצי שליחה בעצמך.
        </p>
        <div className="form-grid">
          <Field label="מייל אילנית, מנהלת אגף השבחה">
            <input className="input" dir="ltr" type="email" value={form.ilanitEmail || ''} placeholder="name@ashdod.muni.il"
              onChange={(e) => setForm({ ...form, ilanitEmail: e.target.value })} />
            <span className="hint">ממולא בכפתור "לאילנית: פרויקט חדש", בקשה לשיבוץ שמאי.</span>
          </Field>
          <Field label="מייל אגף תכנון">
            <input className="input" dir="ltr" type="email" value={form.planningEmail || ''} placeholder="name@ashdod.muni.il"
              onChange={(e) => setForm({ ...form, planningEmail: e.target.value })} />
            <span className="hint">ממולא בכפתור "לאגף תכנון: התקבלה חוות דעת".</span>
          </Field>
        </div>
      </section>

      <section className="settings-block">
        <h3 className="settings-title">אנשי קשר: שמאים ויזמים</h3>
        <p className="hint">
          משמש למיילי תזכורת ולמיילים להשלמת פרטים. המערכת מזהה את השמאי או היזם לפי השם שמופיע בחוות הדעת, וממלאת את הכתובת שלו.
          כתובת שהוקלדה בטיוטת מייל נשמרת כאן אוטומטית.
        </p>
        <div className="contacts">
          {(form.contacts || []).map((c, i) => (
            <div className="contact-row" key={i}>
              <input className="input" placeholder="שם כפי שמופיע בחוות הדעת" aria-label="שם איש קשר" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
              <select className="input select" aria-label="תפקיד" value={c.role} onChange={(e) => setContact(i, { role: e.target.value })}>
                {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input className="input" dir="ltr" type="email" placeholder="email" aria-label="מייל איש קשר" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
              <button className="btn btn-sm btn-ghost btn-quiet" onClick={() => removeContact(i)}>הסר</button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost" onClick={addContact}>הוספת איש קשר</button>
        </div>
      </section>

      {link && (
        <section className="settings-block share">
          <h3 className="settings-title">קישור כניסה לשיתוף</h3>
          <p className="hint">מי שפותח את הקישור נכנס מיד, בלי להקליד קוד. לשלוח רק לצוות, כי הקישור נותן גישה מלאה לנתונים.</p>
          <div className="share-row">
            <input className="input mono" dir="ltr" readOnly value={link} aria-label="קישור כניסה" onFocus={(e) => e.target.select()} />
            <button className="btn btn-ghost" onClick={copyLink}>{copied ? 'הועתק' : 'העתק'}</button>
          </div>
        </section>
      )}
    </Modal>
  );
}
