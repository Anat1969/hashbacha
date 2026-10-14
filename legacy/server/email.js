const nodemailer = require('nodemailer');
const { mail } = require('./config');

let transporter = null;

function isConfigured() {
  return !!(mail.host && mail.user && mail.pass);
}

function getTransporter() {
  if (!transporter && isConfigured()) {
    transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: { user: mail.user, pass: mail.pass },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  if (!isConfigured()) {
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    const t = getTransporter();
    await t.sendMail({ from: mail.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = { sendMail, isConfigured };
