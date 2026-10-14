import React, { useEffect, useState } from 'react';
import { Field, Modal } from './ui.jsx';
import { api } from '../lib/api.js';
import { gmailHref, mailtoHref, outlookHref } from '../lib/mail.js';
import { REPORT_FIELDS } from '../lib/calc.js';

// Every mail opens here first, editable, then goes out through the mail service the user prefers.
export default function MailComposer({ request, onClose, ctx }) {
  const [draft, setDraft] = useState(null);
  const [picked, setPicked] = useState([]);
  const [saveContact, setSaveContact] = useState(true);

  useEffect(() => {
    if (!request) { setDraft(null); return; }
    setDraft(request.build(request.picked));
    setPicked(request.picked || []);
    setSaveContact(true);
  }, [request]);

  if (!request || !draft) return <Modal open={false} title="" onClose={onClose} />;

  const contactName = request.contactName;
  const knownEmail = !!request.knownEmail;
  const offerSave = contactName && draft.to && !knownEmail;

  function togglePick(f) {
    const next = picked.some((p) => p.key === f.key) ? picked.filter((p) => p.key !== f.key) : [...picked, f];
    setPicked(next);
    const rebuilt = request.build(next);
    setDraft({ ...draft, text: rebuilt.text });
  }

  async function rememberContact() {
    if (!offerSave || !saveContact) return;
    const settings = ctx.data.settings || {};
    const contacts = [...(settings.contacts || []).filter((c) => c.name !== contactName),
      { name: contactName, role: request.contactRole || 'אחר', email: draft.to }];
    await ctx.mutate((k) => api.saveSettings(k, { ...settings, contacts }));
  }

  // Every mail that leaves the app is filed to the project history (or the general journal).
  async function fileSent(via) {
    let author = '';
    try { author = localStorage.getItem('hashbacha-author') || ''; } catch { /* storage blocked */ }
    await ctx.mutate((k) => api.saveNote(k, null, {
      kind: 'mail_out',
      body: draft.text,
      author,
      project_id: request.projectId || null,
      meta: { direction: 'out', to: draft.to, subject: draft.subject, via, title: draft.title, date: new Date().toISOString().slice(0, 10) }
    }));
  }

  async function send(kind) {
    await rememberContact();
    await fileSent(kind);
    if (request.onSent) await request.onSent(kind, draft);
    ctx.toast(kind === 'copy' ? 'נוסח המייל הועתק ותויק בתיק הפרויקט' : 'המייל נפתח לשליחה ותויק בתיק הפרויקט', 'ok');
    onClose();
  }

  async function copy() {
    const full = `אל: ${draft.to}\nנושא: ${draft.subject}\n\n${draft.text}`;
    try { await navigator.clipboard.writeText(full); send('copy'); }
    catch { ctx.toast('לא ניתן להעתיק אוטומטית. סמני את הטקסט והעתיקי ידנית.', 'error'); }
  }

  return (
    <Modal
      open
      wide
      title={draft.title}
      onClose={onClose}
      actions={
        <>
          <a className="btn btn-primary" href={gmailHref(draft)} target="_blank" rel="noreferrer" onClick={() => send('gmail')}>פתח ב־Gmail</a>
          <a className="btn btn-ghost" href={outlookHref(draft)} target="_blank" rel="noreferrer" onClick={() => send('outlook')}>פתח ב־Outlook</a>
          <a className="btn btn-ghost" href={mailtoHref(draft)} onClick={() => send('mailto')}>תוכנת הדואר במחשב</a>
          <button className="btn btn-ghost" onClick={copy}>העתק נוסח</button>
          <span className="spacer" />
          <button className="btn btn-ghost btn-quiet" onClick={onClose}>ביטול</button>
        </>
      }
    >
      <p className="hint hint-top">הנוסח מוכן לעריכה. אפשר לשנות כל מילה לפני השליחה. המייל ייפתח בלשונית חדשה בדפדפן.</p>
      <div className="mail-form">
        <Field label="אל">
          <input className="input" dir="ltr" value={draft.to} placeholder="כתובת מייל" aria-label="נמען"
            onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </Field>
        {offerSave && (
          <label className="check">
            <input type="checkbox" checked={saveContact} onChange={(e) => setSaveContact(e.target.checked)} />
            לשמור את הכתובת של {contactName} באנשי הקשר, כדי שתמולא אוטומטית בפעם הבאה
          </label>
        )}
        {!draft.to && contactName && (
          <p className="hint">אין כתובת שמורה עבור {contactName}. אפשר להקליד אותה כאן, והיא תישמר.</p>
        )}
        <Field label="נושא">
          <input className="input" value={draft.subject} aria-label="נושא"
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        </Field>
        {draft.kind === 'missingDetails' && (
          <div className="pick">
            <span className="label">פרטים חסרים לציון במייל (מסומנים אוטומטית לפי השדות הריקים בחוות הדעת האחרונה)</span>
            <div className="pick-grid">
              {REPORT_FIELDS.map((f) => (
                <label key={f.key} className="check">
                  <input type="checkbox" checked={picked.some((p) => p.key === f.key)} onChange={() => togglePick(f)} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <Field label="תוכן">
          <textarea className="input mail-body" rows={12} value={draft.text} aria-label="תוכן המייל"
            onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
