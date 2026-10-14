// A web page cannot choose the browser it opens in. What it can do: notice it is not in Chrome,
// hand over a Chrome-specific link where the platform has one, and be installable as a Chrome app.
const ua = () => navigator.userAgent || '';

export function browserName() {
  const u = ua();
  if (/Edg\//.test(u)) return 'Microsoft Edge';
  if (/OPR\//.test(u)) return 'Opera';
  if (/SamsungBrowser/.test(u)) return 'Samsung Internet';
  if (/Firefox\//.test(u)) return 'Firefox';
  if (/CriOS/.test(u)) return 'Chrome';
  if (/Chrome\//.test(u) && (navigator.vendor || '').includes('Google')) return 'Chrome';
  if (/Safari\//.test(u)) return 'Safari';
  return 'דפדפן אחר';
}

export const isChrome = () => browserName() === 'Chrome';
export const platform = () => (/Android/i.test(ua()) ? 'android' : /iPhone|iPad|iPod/i.test(ua()) ? 'ios' : /Windows/i.test(ua()) ? 'windows' : /Mac OS X/i.test(ua()) ? 'mac' : 'other');

// Direct "open in Chrome" link where the OS supports one.
export function chromeHref(url) {
  const u = new URL(url);
  const p = platform();
  if (p === 'android') return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;end`;
  if (p === 'ios') return `googlechromes://${u.host}${u.pathname}${u.search}${u.hash}`;
  return null;
}

// Desktop fallback: a tiny launcher file that always opens the app in Chrome.
export function downloadLauncher(url) {
  const p = platform();
  const isMac = p === 'mac';
  const content = isMac
    ? `#!/bin/sh\nopen -a "Google Chrome" "${url}"\n`
    : `@echo off\r\nstart "" chrome "${url}"\r\n`;
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = isMac ? 'השבחה בכרום.command' : 'השבחה בכרום.cmd';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
