import React, { useEffect, useMemo, useState } from 'react';
import { Field, Modal } from './ui.jsx';
import { api } from '../lib/api.js';
import { guessProject, guessRole, parseMail } from '../lib/mailParse.js';

export const MAIL_ROLES = ['היזם', 'שמאי היזם', 'שמאי העירייה', 'אגף תכנון', 'אילנית', 'אחר'];

const today = () => new Date().toISOString().slice(0, 10);

// Files an email that came in (or went out) through the city's mail system into a project's history.
export default function MailLog({ open, onClose, ctx, projectId = null }) {
  const [raw, setRaw] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (open) {
      setRaw('');
      setForm({ direction: 'in', date: today(), fromName: '', fromEmail: '', role: '', subject: '', body: '', project: projectId || '' });
    }
  }, [open, projectId]);

  const contacts = ctx.data.settings?.contacts || [];
  const projects = ctx.data.projects;
  const entry = useMemo(() => projects.find((e) => e.project._id === form?.project), [projects, form?.project]);

  function onPaste(text) {
    setRaw(text);
    if (!text.trim()) return;
    const m = parseMail(text);
    const proj = projectId || guessProject(projects, text) || form.project;
    const ent = projects.find((e) => e.project._id === proj);
    setForm((f) => ({
      ...f,
      date: m.date || f.date,
      fromName: m.fromName || f.fromName,
      fromEmail: m.fromEmail || f.fromEmail,
      subject: m.subject || f.subject,
      body: m.body,
      project: proj || '',
      role: guessRole(ent, contacts, m.fromName, m.fromEmail) || f.role
    }));
  }

  async function save() {
    if (!form.body.trim() && !form.subject.trim()) { ctx.toast('הדביקי את המייל או כתבי נושא', 'error'); return; }
    const res = await ctx.mutate((k) => api.saveNote(k, null, {
      kind: form.direction === 'in' ? 'mail_in' : 'mail_out',
      body: form.body.trim(),
      author: form.fromName,
      project_id: form.project || null,
      meta: { direction: form.direction, external: true, from: form.fromName, email: form.fromEmail, role: form.role, subject: form.subject, date: form.date }
    }), form.project ? 'המייל תויק בתיק הפרויקט' : 'המייל נשמר ביומן');
    if (res !== null) onClose();
  }

  if (!form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open={open}
      wide
      title="תיוק מייל מתיבת הדואר של העירייה"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-primary" onClick={save}>תייק מייל</button>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
        </>
      }
    >
      <ol className="steps">
        <li>פותחים את המייל ב־Outlook, מסמנים הכול (Ctrl+A) ומעתיקים (Ctrl+C).</li>
        <li>מדביקים כאן. השולח, התאריך והנושא מזוהים אוטומטית, וגם הפרויקט והתפקיד כשאפשר.</li>
        <li>בודקים את השדות ולוחצים "תייק מייל".</li>
      </ol>
      <Field label="הדבקת המייל">
        <textarea className="input mail-paste" rows={5} aria-label="הדבקת המייל" placeholder="מדביקים כאן את כל המייל, כולל שורות מאת / נשלח / נושא"
          value={raw} onChange={(e) => onPaste(e.target.value)} />
      </Field>
      <div className="form-grid mail-log-grid">
        <Field label="כיוון">
          <div className="seg-control" role="radiogroup" aria-label="כיוון">
            {[['in', 'התקבל אצלנו'], ['out', 'נשלח מאיתנו']].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={form.direction === v} className={form.direction === v ? 'on' : ''} onClick={() => set({ direction: v })}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="תאריך המייל">
          <input className="input" type="date" aria-label="תאריך המייל" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label={form.direction === 'in' ? 'שולח' : 'נמען'}>
          <input className="input" aria-label="שם השולח" value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} />
        </Field>
        <Field label="תפקיד בפרויקט">
          <select className="input" aria-label="תפקיד השולח" value={form.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="">לא צוין</option>
            {MAIL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="נושא" wide>
          <input className="input" aria-label="נושא המייל" value={form.subject} onChange={(e) => set({ subject: e.target.value })} />
        </Field>
        {!projectId && (
          <Field label="פרויקט">
            <select className="input" aria-label="פרויקט המייל" value={form.project} onChange={(e) => set({ project: e.target.value })}>
              <option value="">ללא פרויקט (יומן כללי)</option>
              {projects.map((e) => (
                <option key={e.project._id} value={e.project._id}>{e.project['שם התכנית'] || e.project['כתובת הפרויקט']} · {e.project['שם היזם']}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {entry && !projectId && <p className="hint">זוהה פרויקט: <b>{entry.project['שם התכנית'] || entry.project['כתובת הפרויקט']}</b>. אפשר לשנות.</p>}
      <Field label="תוכן">
        <textarea className="input" rows={5} aria-label="תוכן המייל" value={form.body} onChange={(e) => set({ body: e.target.value })} />
      </Field>
    </Modal>
  );
}
