require('@dotenvx/dotenvx').config();

const port = process.env.PORT || 3000;

const mail = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || '',
  ilanitEmail: process.env.ILANIT_EMAIL || '',
  planningEmail: process.env.PLANNING_EMAIL || '',
};

module.exports = { port, mail };
