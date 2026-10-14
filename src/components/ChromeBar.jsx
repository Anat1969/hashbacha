import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { browserName, chromeHref, downloadLauncher, isChrome, isInstalled, platform } from '../lib/browser.js';
import { KEY_STORAGE } from '../lib/config.js';
import { ease } from './ui.jsx';

export const CLAUDE_CODE_URL = 'https://claude.ai/code/session_01UzVk7xioRom6ZL3XuCQai4';

function entryUrl() {
  let k = '';
  try { k = localStorage.getItem(KEY_STORAGE) || ''; } catch { /* storage blocked */ }
  return `${window.location.origin}/${k ? `?k=${encodeURIComponent(k)}` : ''}`;
}

// Shown outside Chrome: explains, and offers the most direct way into Chrome on this device.
export function ChromeBanner() {
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('hb-chrome-dismissed') === '1'; } catch { return false; } });
  if (isChrome() || hidden) return null;
  const href = chromeHref(entryUrl());
  const desktop = platform() === 'windows' || platform() === 'mac';
  return (
    <AnimatePresence>
      <motion.div className="chrome-banner" role="region" aria-label="פתיחה בכרום"
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, ease }}>
        <span><b>האפליקציה נפתחה ב־{browserName()}.</b> היא מותאמת לגוגל כרום.</span>
        {href && <a className="btn btn-sm btn-primary" href={href}>פתיחה בכרום</a>}
        {desktop && <button className="btn btn-sm btn-primary" onClick={() => downloadLauncher(entryUrl())}>הורדת קיצור דרך שנפתח בכרום</button>}
        <button className="btn btn-sm btn-ghost btn-on-dark" onClick={() => { navigator.clipboard?.writeText(entryUrl()); }}>העתקת הקישור להדבקה בכרום</button>
        <button className="link-btn link-on-dark" onClick={() => { try { sessionStorage.setItem('hb-chrome-dismissed', '1'); } catch { /* ignore */ } setHidden(true); }}>הסתר</button>
      </motion.div>
    </AnimatePresence>
  );
}

// In Chrome: install as an app, so the desktop/taskbar icon always opens here.
// withStatus: in Settings, always say something (installed / how to install / open in Chrome) instead of disappearing.
export function InstallButton({ className = 'btn btn-ghost', withStatus = false }) {
  const [ready, setReady] = useState(!!window.__hbInstall);
  const [installed, setInstalled] = useState(isInstalled());
  useEffect(() => {
    const on = () => setReady(true);
    const done = () => setInstalled(true);
    window.addEventListener('hb-installable', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('hb-installable', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (installed || !ready || !isChrome()) {
    if (!withStatus) return null;
    return (
      <span className="hint install-status">
        {installed ? 'האפליקציה מותקנת במחשב הזה. פותחים אותה מהסמל בשולחן העבודה או בשורת המשימות.'
          : !isChrome() ? 'ההתקנה זמינה רק בכרום. פתחי את האפליקציה בכרום, וכפתור ההתקנה יופיע כאן.'
          : 'אם כפתור ההתקנה לא מופיע: בכרום, תפריט שלוש הנקודות, "העברה, שמירה ושיתוף" ואז "התקנת דף כאפליקציה".'}
      </span>
    );
  }
  return (
    <button className={className} onClick={async () => { const e = window.__hbInstall; if (!e) return; e.prompt(); const r = await e.userChoice; if (r.outcome === 'accepted') setInstalled(true); }}>
      התקנה כאפליקציה בכרום
    </button>
  );
}

export { entryUrl };
