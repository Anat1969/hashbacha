import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { NOTE_KINDS } from '../lib/fields.js';
import { ease } from './ui.jsx';

const AUTHOR_KEY = 'hashbacha-author';
const readAuthor = () => { try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch { return ''; } };
const writeAuthor = (v) => { try { localStorage.setItem(AUTHOR_KEY, v); } catch { /* storage blocked */ } };

const kindLabel = (k) => (k === 'mail_out' ? 'מייל יוצא' : k === 'mail_in' ? 'מייל נכנס' : (NOTE_KINDS.find((x) => x.value === k) || NOTE_KINDS[3]).label);
export const isMail = (n) => n.kind === 'mail_out' || n.kind === 'mail_in';
// The date a note "happened": the email's own date when filed later, else when it was written.
export const noteDate = (n) => new Date((n.meta && n.meta.date) || n.created_at);

function MailBody({ n }) {
  const [open, setOpen] = useState(false);
  const m = n.meta || {};
  const long = (n.body || '').split('\n').length > 4 || (n.body || '').length > 320;
  return (
    <>
      <p className="mail-subject">{m.subject || '(ללא נושא)'}</p>
      <p className="mail-party">
        {n.kind === 'mail_in' ? <><span className="role">מאת:</span> {m.from || '—'}</> : <><span className="role">אל:</span> {m.to || m.from || '—'}</>}
        {m.role && <span className="party-role">{m.role}</span>}
        {m.external ? <span className="muted"> · תויק מתיבת הדואר</span> : <span className="muted"> · נשלח מהמערכת{m.via ? ` (${({ gmail: 'Gmail', outlook: 'Outlook', mailto: 'תוכנת דואר', copy: 'הועתק' })[m.via] || m.via})` : ''}</span>}
      </p>
      {n.body && <p className={`note-body mail-text${open || !long ? '' : ' clamp'}`}>{n.body}</p>}
      {long && <button className="link-btn" onClick={() => setOpen(!open)}>{open ? 'הצג פחות' : 'הצג את כל המייל'}</button>}
    </>
  );
}

export function formatStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function NoteComposer({ ctx, projectId = null, allowProjectPick = false, placeholder }) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState(projectId ? 'note' : 'todo');
  const [author, setAuthor] = useState(readAuthor);
  const [project, setProject] = useState(projectId || '');
  const [due, setDue] = useState('');

  async function save() {
    if (!body.trim()) { ctx.toast('כתבי את ההערה לפני השמירה', 'error'); return; }
    writeAuthor(author.trim());
    const res = await ctx.mutate((k) => api.saveNote(k, null, {
      body: body.trim(), kind, author: author.trim(), project_id: project || null, due, done: false
    }), 'ההערה נשמרה');
    if (res !== null) { setBody(''); setDue(''); setProject(projectId || ''); }
  }

  const projects = ctx.data.projects;
  return (
    <div className="composer">
      <textarea
        className="input composer-body"
        rows={3}
        placeholder={placeholder || 'מה צריך לעשות, לבקש, לזכור או לשמור?'}
        value={body}
        aria-label="תוכן ההערה"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="composer-row">
        <div className="seg-control" role="radiogroup" aria-label="סוג">
          {NOTE_KINDS.map((k) => (
            <button key={k.value} type="button" role="radio" aria-checked={kind === k.value}
              className={kind === k.value ? 'on' : ''} onClick={() => setKind(k.value)}>{k.label}</button>
          ))}
        </div>
        {allowProjectPick && (
          <select className="input select" value={project} aria-label="תיוק לפרויקט" onChange={(e) => setProject(e.target.value)}>
            <option value="">ללא תיוק לפרויקט</option>
            {projects.map((e) => (
              <option key={e.project._id} value={e.project._id}>
                {(e.project['שם התכנית'] || e.project['כתובת הפרויקט'] || '—')} · {e.project['שם היזם'] || ''}
              </option>
            ))}
          </select>
        )}
        <label className="inline-field">
          <span className="label">יעד</span>
          <input className="input input-date" type="date" value={due} aria-label="תאריך יעד" onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="inline-field">
          <span className="label">נכתב ע״י</span>
          <input className="input input-author" value={author} placeholder="שם" aria-label="כותב ההערה" onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={save}>שמור הערה</button>
      </div>
    </div>
  );
}

export function NoteList({ ctx, notes, showProject = false, empty }) {
  async function toggle(n) {
    await ctx.mutate((k) => api.saveNote(k, n._id, { ...n, done: !n.done }), n.done ? 'סומן כפתוח' : 'סומן כבוצע');
  }
  async function remove(n) {
    const ok = await ctx.confirm('למחוק את ההערה?');
    if (ok) await ctx.mutate((k) => api.removeNote(k, n._id), 'ההערה נמחקה');
  }
  const byId = new Map(ctx.data.projects.map((e) => [e.project._id, e.project]));
  if (!notes.length) return <p className="muted">{empty || 'אין עדיין הערות.'}</p>;
  return (
    <ul className="notes-list">
      <AnimatePresence initial={false}>
        {notes.map((n) => {
          const p = n.project_id ? byId.get(n.project_id) : null;
          const actionable = n.kind !== 'note' && !isMail(n);
          return (
            <motion.li
              key={n._id}
              layout
              className={`note note-${n.kind}${n.done ? ' note-done' : ''}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
            >
              {actionable ? (
                <button className={`tick${n.done ? ' on' : ''}`} onClick={() => toggle(n)} aria-label={n.done ? 'סמן כפתוח' : 'סמן כבוצע'}>
                  <span />
                </button>
              ) : <span className={`tick tick-static${isMail(n) ? ` tick-${n.kind}` : ''}`} aria-hidden="true" />}
              <div className="note-main">
                <div className="note-meta">
                  <span className={`kind kind-${n.kind}`}>{kindLabel(n.kind)}</span>
                  <span className="mono note-date">{formatStamp(noteDate(n).toISOString())}</span>
                  {n.author && !isMail(n) && <span className="note-author">{n.author}</span>}
                  {n.due && <span className="due mono">יעד {formatStamp(n.due)}</span>}
                  {showProject && p && <a className="note-project" href={`#/p/${n.project_id}`}>{p['שם התכנית'] || p['שם היזם']}</a>}
                  {showProject && !p && <span className="muted">כללי</span>}
                </div>
                {isMail(n) ? <MailBody n={n} /> : <p className="note-body">{n.body}</p>}
              </div>
              <button className="btn btn-sm btn-ghost btn-quiet" onClick={() => remove(n)}>מחק</button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
