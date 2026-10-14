import React, { useEffect, useState } from 'react';
import { Field, Modal } from './ui.jsx';
import { api } from '../lib/api.js';
import { composeHref } from '../lib/mail.js';
import { REPORT_FIELDS } from '../lib/calc.js';

// Every mail opens here first, editable, then goes out through the mail service the user prefers.
export default function MailComposer({ request, onClose, ctx }) {
  const [draft, setDraft] = useState(null);
  const [picked, setPicked] = useState([]);
  const [saveContact, setSaveContact] = useState(true);
  const [opened, setOpened] = useState(null); // { via } once the mail was opened elsewhere, awaiting "sent?"

  useEffect(() => {
    if (!request) { setDraft(null); return; }
    setDraft(request.build(request.picked));
    setPicked(request.picked || []);
    setSaveContact(true);
    setOpened(null);
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
    if (!offerSave || !saveContact || ctx.role !== 'editor') return;
    const settings = ctx.data.settings || {};
    const contacts = [...(settings.contacts || []).filter((c) => c.name !== contactName),
      { name: contactName, role: request.contactRole || 'אחר', email: draft.to }];
    await ctx.mutate((k) => api.saveSettings(k, { ...settings, contacts }));
  }

  // Every mail that leaves the app is filed to the project history (or the general journal).
  async function fileSent(via) {
    let author = '';
    try { author = localStorage.getItem('hashbacha-author') || ''; } catch { /* storage blocked */ }
    return ctx.mutate((k) => api.saveNote(k, null, {
      kind: 'mail_out',
      body: draft.text,
      author,
      project_id: request.projectId || null,
      meta: { direction: 'out', to: draft.to, subject: draft.subject, via, title: draft.title, date: new Date().toISOString().slice(0, 10) }
    }));
  }

  const VIA = { gmail: 'Gmail', outlook: 'Outlook', mailto: 'תוכנת הדואר', copy: 'העתקה' };
  const links = { gmail: composeHref('gmail', draft), outlook: composeHref('outlook', draft), mailto: composeHref('mailto', draft) };

  // Opening only opens: nothing is filed until the user confirms the mail really went out.
  async function openIn(e, via) {
    const link = links[via];
    if (link.trimmed) {
      e.preventDefault();
      try { await navigator.clipboard.writeText(draft.text); }
      catch { ctx.toast('המייל ארוך מדי לקישור, וההעתקה האוטומטית נחסמה. סמני את התוכן, העתיקי, ונסי שוב.', 'error'); return; }
      if (via === 'mailto') window.location.href = link.href; else window.open(link.href, '_blank', 'noopener');
      ctx.toast(`המייל ארוך מדי לקישור, ולכן הנוסח המלא הועתק. בחלון של ${VIA[via]}: Ctrl+V בגוף המייל.`, 'info');
    }
    setOpened({ via, trimmed: link.trimmed });
  }

  async function copy() {
    const full = `אל: ${draft.to}\nנושא: ${draft.subject}\n\n${draft.text}`;
    try { await navigator.clipboard.writeText(full); setOpened({ via: 'copy' }); }
    catch { ctx.toast('לא ניתן להעתיק אוטומטית. סמני את הטקסט והעתיקי ידנית.', 'error'); }
  }

  async function confirmSent() {
    await rememberContact();
    const res = await fileSent(opened.via);
    if (res === null) return;
    if (request.onSent) await request.onSent(opened.via, draft);
    ctx.toast('המייל תויק כנשלח בתיק הפרויקט', 'ok');
    onClose();
  }

  return (
    <Modal
      open
      wide
      title={draft.title}
      onClose={onClose}
      actions={opened ? (
        <>
          <span className="mail-confirm">
            {opened.via === 'copy' ? 'הנוסח הועתק.' : `המייל נפתח ב־${VIA[opened.via]}${opened.trimmed ? ', והנוסח המלא הועתק להדבקה' : ''}.`} אחרי השליחה שם, לסמן כאן:
          </span>
          <button className="btn btn-primary" onClick={confirmSent}>נשלח, לתייק</button>
          <button className="btn btn-ghost" onClick={() => setOpened(null)}>לא נשלח, חזרה לעריכה</button>
          <span className="spacer" />
          <button className="btn btn-ghost btn-quiet" onClick={onClose}>סגירה בלי לתייק</button>
        </>
      ) : (
        <>
          <a className="btn btn-primary" href={links.gmail.href} target="_blank" rel="noreferrer" onClick={(e) => openIn(e, 'gmail')}>פתח ב־Gmail</a>
          <a className="btn btn-ghost" href={links.outlook.href} target="_blank" rel="noreferrer" onClick={(e) => openIn(e, 'outlook')}>פתח ב־Outlook</a>
          <a className="btn btn-ghost" href={links.mailto.href} onClick={(e) => openIn(e, 'mailto')}>תוכנת הדואר במחשב</a>
          <button className="btn btn-ghost" onClick={copy}>העתק נוסח</button>
          <span className="spacer" />
          <button className="btn btn-ghost btn-quiet" onClick={onClose}>ביטול</button>
        </>
      )}
    >
      <p className="hint hint-top">
        הנוסח מוכן לעריכה. אפשר לשנות כל מילה לפני השליחה. המייל ייפתח בלשונית חדשה בדפדפן, והשליחה עצמה נעשית שם.
        המייל יתויק בתיק רק אחרי שתסמני "נשלח".
        {(links.gmail.trimmed || links.outlook.trimmed) && ' המייל ארוך: בפתיחה הנוסח המלא יועתק, ויש להדביק אותו (Ctrl+V) בגוף המייל.'}
      </p>
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
