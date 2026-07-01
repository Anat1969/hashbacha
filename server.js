const express = require('express');
const fs = require('fs');
const path = require('path');
const { port, mail } = require('./server/config');
const { sendMail, isConfigured } = require('./server/email');

const app = express();
const dataPath = path.join(__dirname, 'data', 'projects.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readData() {
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

function findProject(data, id) {
  return data.projects.find((project) => project.project._id === id);
}

function mailBodyForProject(project) {
  const p = project.project || project;
  return [
    'שלום,',
    '',
    'נוסף פרויקט חדש ונדרשת חוות דעת.',
    '',
    `שם היזם: ${p['שם היזם'] || ''}`,
    `כתובת הפרויקט: ${p['כתובת הפרויקט'] || ''}`,
    `מספר תכנית: ${p["מס' תכנית/ מס זמני"] || ''}`,
    `שם התכנית: ${p['שם התכנית'] || ''}`,
    `קישור: ${p['קישור'] || ''}`,
    '',
    'נא להפנות לשמאי מוסמך לקבלת חוות דעת מטעם העירייה.',
    ''
  ].join('\n');
}

app.get('/api/projects', (req, res) => {
  const data = readData();
  data.settings = data.settings || {};
  data.settings.ilanitEmail = data.settings.ilanitEmail || mail.ilanitEmail || '';
  data.settings.planningEmail = data.settings.planningEmail || mail.planningEmail || '';
  data.emailConfigured = isConfigured();
  res.json(data);
});

app.put('/api/projects', (req, res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.projects)) {
    return res.status(400).json({ error: 'invalid_data' });
  }
  writeData(data);
  res.json({ ok: true });
});

app.post('/api/notify/new-project', async (req, res) => {
  const { project, to } = req.body || {};
  const recipient = to || mail.ilanitEmail;
  const subject = 'נוסף פרויקט חדש ונדרשת חוות דעת';
  const text = mailBodyForProject(project || {});
  const result = await sendMail({ to: recipient, subject, text });
  res.json({ ...result, subject, text, to: recipient });
});

app.post('/api/notify/opinion-ready', async (req, res) => {
  const { project, to } = req.body || {};
  const p = (project && project.project) || project || {};
  const recipient = to || mail.planningEmail;
  const subject = 'קיימת חוות דעת מטעם העירייה';
  const text = [
    'שלום,',
    '',
    'עודכנה חוות דעת מטעם העירייה עבור הפרויקט.',
    '',
    `שם היזם: ${p['שם היזם'] || ''}`,
    `כתובת הפרויקט: ${p['כתובת הפרויקט'] || ''}`,
    `מספר תכנית: ${p["מס' תכנית/ מס זמני"] || ''}`,
    `שם התכנית: ${p['שם התכנית'] || ''}`,
    `קישור: ${p['קישור'] || ''}`,
    ''
  ].join('\n');
  const result = await sendMail({ to: recipient, subject, text });
  res.json({ ...result, subject, text, to: recipient });
});

app.listen(port, () => {
  console.log(`App ready: http://localhost:${port}`);
});
