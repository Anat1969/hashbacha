import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from './lib/api.js';
import { KEY_STORAGE } from './lib/config.js';
import { Toasts, ease } from './components/ui.jsx';
import Gate from './components/Gate.jsx';
import ProjectsView from './components/ProjectsView.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';
import Analytics from './components/Analytics.jsx';
import ActivityView from './components/ActivityView.jsx';
import ReviewsView from './components/review/ReviewsView.jsx';
import Guide from './components/Guide.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import MailComposer from './components/MailComposer.jsx';
import { ChromeBanner } from './components/ChromeBar.jsx';

// An entry link (?k=CODE) signs in with one click; the code is then removed from the address bar.
function readKey() {
  const fromUrl = new URLSearchParams(window.location.search).get('k');
  if (fromUrl) {
    const k = fromUrl.trim().toUpperCase();
    writeKey(k);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    return k;
  }
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}
function writeKey(k) {
  try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE); } catch { /* storage blocked */ }
}

function parseRoute() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [a, b, c, d] = h.split('/');
  if (a === 'p' && b) return { view: 'project', id: decodeURIComponent(b), tab: c === 'r' ? 'review' : null, reviewId: c === 'r' && d ? d : null };
  if (a === 'a') return { view: 'analytics', tab: b || null };
  if (a === 'log') return { view: 'activity' };
  if (a === 's') return { view: 'reviews' };
  if (a === 'guide') return { view: 'guide' };
  return { view: 'projects' };
}

export function go(path) {
  window.location.hash = path;
}

const NAV = [
  { path: '#/', view: 'projects', label: 'פרויקטים' },
  { path: '#/s', view: 'reviews', label: 'בקרת שומות' },
  { path: '#/a', view: 'analytics', label: 'ניתוח' },
  { path: '#/log', view: 'activity', label: 'יומן' },
  { path: '#/guide', view: 'guide', label: 'מדריך' }
];

export default function App() {
  const [key, setKey] = useState(readKey);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [route, setRoute] = useState(parseRoute);
  const [toasts, setToasts] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mailRequest, setMailRequest] = useState(null);
  const toastId = useRef(0);

  const toast = useCallback((text, tone = 'info', action = null) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 2800);
  }, []);

  const confirm = useCallback((message, okLabel = 'מחק') => new Promise((resolve) => {
    setConfirmState({ message, okLabel, resolve });
  }), []);

  const logout = useCallback(() => {
    writeKey('');
    setKey('');
    setData(null);
    setStatus('idle');
  }, []);

  const load = useCallback(async (k = key, quiet = false) => {
    if (!k) return;
    if (!quiet) setStatus('loading');
    try {
      const d = await api.load(k);
      setData(d);
      setStatus('ready');
    } catch (e) {
      if (e.forbidden) { logout(); return; }
      setStatus('error');
    }
  }, [key, logout]);

  useEffect(() => { if (key) load(key); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Every write goes through here: one spinner, one error path, one refresh.
  const mutate = useCallback(async (fn, okText) => {
    setBusy(true);
    try {
      const res = await fn(key);
      await load(key, true);
      if (okText) toast(okText, 'ok');
      return res ?? true; // null is reserved for failure

    } catch (e) {
      if (e.forbidden) { logout(); toast('קוד הגישה אינו תקף עוד', 'error'); return null; }
      if (e.readonly) { toast('לקוד הזה יש הרשאת צפייה בלבד. השינוי לא נשמר.', 'error'); return null; }
      toast('השמירה נכשלה. הנתונים לא השתנו.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [key, load, toast, logout]);

  // Reads that are not part of hb_load (e.g. a full review) use the same code.
  const query = useCallback((fn) => fn(key), [key]);

  const ctx = useMemo(() => ({
    data, mutate, query, toast, confirm, busy, reload: () => load(key, true), openMail: setMailRequest,
    role: data?.me?.role || 'editor'
  }), [data, mutate, query, toast, confirm, busy, load, key]);

  // The guide is public: it explains the app before anyone has a code.
  if (!key && route.view === 'guide') {
    return (
      <div className="app">
        <div className="backdrop" aria-hidden="true"><div className="grid-plane" /><div className="glow glow-a" /><div className="glow glow-b" /></div>
        <main className="main"><Guide standalone /></main>
      </div>
    );
  }

  if (!key) {
    return (
      <>
        <Gate onEnter={(k) => { writeKey(k); setKey(k); }} />
        <Toasts items={toasts} />
      </>
    );
  }

  const projects = data?.projects || [];
  const current = route.view === 'project' ? projects.find((e) => e.project._id === route.id) : null;

  return (
    <div className="app">
      <div className="backdrop" aria-hidden="true">
        <div className="grid-plane" />
        <div className="glow glow-a" />
        <div className="glow glow-b" />
      </div>

      <ChromeBanner />
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-text">
            <span className="brand-name">השבחה</span>
            <span className="label">מעקב חוות דעת · התחדשות עירונית</span>
          </span>
        </a>
        <nav className="nav" aria-label="ניווט ראשי">
          {NAV.map((n) => (
            <a key={n.view} href={n.path} className={`nav-link${route.view === n.view || (n.view === 'projects' && route.view === 'project') ? ' active' : ''}`}>
              {n.label}
              {(route.view === n.view || (n.view === 'projects' && route.view === 'project')) && (
                <motion.span layoutId="nav-underline" className="nav-underline" transition={{ duration: 0.35, ease }} />
              )}
            </a>
          ))}
        </nav>
        <div className="topbar-actions">
          <AnimatePresence>
            {busy && (
              <motion.span className="sync" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <span className="sync-dot" /> שומר
              </motion.span>
            )}
          </AnimatePresence>
          {ctx.role !== 'editor' && data && (
            <span className="pill pill-none role-pill" title={ctx.role === 'reviewer' ? 'אפשר לבדוק שומות, לסמן ולשלוח מכתבי הוראות. עריכת פרויקטים שמורה לעורכים.' : 'אפשר לצפות בכל הנתונים. שינויים שמורים לעורכים ולבודקים.'}>
              {ctx.role === 'reviewer' ? 'הרשאת בודק' : 'צפייה בלבד'}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>הגדרות</button>
        </div>
      </header>

      <main className="main">
        {status === 'loading' && !data && <LoadingState />}
        {status === 'error' && !data && (
          <div className="state-card">
            <h2 className="display-s">אין חיבור לשרת</h2>
            <p>הנתונים לא נטענו. בדקו את החיבור ונסו שוב.</p>
            <button className="btn btn-primary" onClick={() => load()}>נסה שוב</button>
          </div>
        )}
        {data && (
          <AnimatePresence mode="wait">
            <motion.div
              key={route.view + (route.id || '') + (route.view === 'project' ? '' : (route.tab || ''))}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease }}
            >
              {route.view === 'projects' && <ProjectsView ctx={ctx} />}
              {route.view === 'project' && (current
                ? <ProjectDetail ctx={ctx} entry={current} tab={route.tab} reviewId={route.reviewId} />
                : <NotFound />)}
              {route.view === 'analytics' && <Analytics ctx={ctx} tab={route.tab} />}
              {route.view === 'activity' && <ActivityView ctx={ctx} />}
              {route.view === 'reviews' && <ReviewsView ctx={ctx} />}
              {route.view === 'guide' && <Guide />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <footer className="footer">
        <span className="label">אגף השבחה · עיריית אשדוד</span>
        <span className="label">{data ? `${projects.length} פרויקטים במאגר` : ''}</span>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        ctx={ctx}
        onLogout={() => { setSettingsOpen(false); logout(); }}
      />
      <MailComposer request={mailRequest} onClose={() => setMailRequest(null)} ctx={ctx} />
      <ConfirmDialog state={confirmState} onDone={(v) => { confirmState?.resolve(v); setConfirmState(null); }} />
      <Toasts items={toasts} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="skeleton"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <div className="state-card">
      <h2 className="display-s">הפרויקט לא נמצא</h2>
      <p>ייתכן שנמחק. אפשר לשחזר אותו מסל המחזור.</p>
      <a className="btn btn-primary" href="#/log">לסל המחזור</a>
    </div>
  );
}
