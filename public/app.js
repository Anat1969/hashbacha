(function () {
  'use strict';

  var appData = null;
  var serverMode = false;
  var currentSort = { col: null, asc: true };
  var currentProjectId = null;
  var searchTimeout = null;

  var PROJECT_FIELDS = [
    { key: 'שם היזם', label: 'שם היזם', type: 'text' },
    { key: 'כתובת הפרויקט', label: 'כתובת הפרויקט', type: 'text' },
    { key: "מס' תכנית/ מס זמני", label: "מס׳ תכנית / מס׳ זמני", type: 'text' },
    { key: 'שם התכנית', label: 'שם התכנית', type: 'text' },
    { key: 'סטטוס רמזור', label: 'סטטוס רמזור', type: 'traffic' },
    { key: 'קישור', label: 'קישור', type: 'url' }
  ];

  var OPINION_FIELDS = [
    { key: 'שמאי מטעם היזם', label: 'שמאי מטעם היזם', type: 'text' },
    { key: 'שמאי מטעם העירייה', label: 'שמאי מטעם העירייה', type: 'text' },
    { key: 'תאריך קבלת בקשה', label: 'תאריך קבלת בקשה', type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'תאריך קבלת חוו"ד', label: 'תאריך קבלת חוו״ד', type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'רווחיות (%)', label: 'רווחיות (%)', type: 'text' },
    { key: 'הערות / סטטוס', label: 'הערות / סטטוס', type: 'textarea' },
    { key: 'מימוש', label: 'מימוש', type: 'text' },
    { key: 'ת.ב.', label: 'ת.ב.', type: 'text' }
  ];

  var TRAFFIC_OPTIONS = [
    { value: '', label: 'ללא' },
    { value: 'green', label: 'ירוק' },
    { value: 'yellow', label: 'צהוב' },
    { value: 'red', label: 'אדום' }
  ];

  // ── Init ──

  async function init() {
    try {
      var res = await fetch('/api/projects');
      if (res.ok) {
        appData = await res.json();
        serverMode = true;
      } else {
        throw new Error('not ok');
      }
    } catch (e) {
      serverMode = false;
      var saved = localStorage.getItem('hashbacha-data');
      appData = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(window.SEED_DATA));
    }
    appData.settings = appData.settings || {};
    renderProjectsTable();
    wireEvents();
  }

  // ── Data Layer ──

  async function saveData() {
    if (serverMode) {
      try {
        await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appData)
        });
      } catch (e) {
        showToast('שגיאה בשמירה לשרת');
      }
    } else {
      localStorage.setItem('hashbacha-data', JSON.stringify(appData));
    }
  }

  // ── Render: Projects Table ──

  function getFilteredProjects() {
    var query = (document.getElementById('search-input').value || '').trim().toLowerCase();
    if (!query) return appData.projects;
    return appData.projects.filter(function (entry) {
      var p = entry.project;
      for (var k in p) {
        if (String(p[k]).toLowerCase().indexOf(query) !== -1) return true;
      }
      for (var i = 0; i < entry.opinions.length; i++) {
        var o = entry.opinions[i];
        for (var k2 in o) {
          if (String(o[k2]).toLowerCase().indexOf(query) !== -1) return true;
        }
      }
      return false;
    });
  }

  function sortProjects(list) {
    if (!currentSort.col) return list;
    var col = currentSort.col;
    var asc = currentSort.asc;
    var copy = list.slice();
    copy.sort(function (a, b) {
      var va, vb;
      if (col === 'opinions') {
        va = a.opinions.length;
        vb = b.opinions.length;
      } else if (col === '#') {
        return 0;
      } else {
        va = a.project[col] || '';
        vb = b.project[col] || '';
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return asc ? va - vb : vb - va;
      }
      return asc
        ? String(va).localeCompare(String(vb), 'he')
        : String(vb).localeCompare(String(va), 'he');
    });
    return copy;
  }

  function renderProjectsTable() {
    var filtered = getFilteredProjects();
    var sorted = sortProjects(filtered);
    var tbody = document.querySelector('#projects-table tbody');
    tbody.innerHTML = '';
    for (var i = 0; i < sorted.length; i++) {
      var entry = sorted[i];
      var p = entry.project;
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', p._id);
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(p['שם היזם']) + '</td>' +
        '<td>' + esc(p['כתובת הפרויקט']) + '</td>' +
        '<td>' + esc(p["מס' תכנית/ מס זמני"]) + '</td>' +
        '<td>' + esc(p['שם התכנית']) + '</td>' +
        '<td>' + trafficDot(p['סטטוס רמזור']) + '</td>' +
        '<td>' + entry.opinions.length + '</td>' +
        '<td class="actions">' +
          '<button class="btn-sm" data-action="view" data-id="' + p._id + '">צפה</button> ' +
          '<button class="btn-sm btn-secondary" data-action="edit-project" data-id="' + p._id + '">ערוך</button> ' +
          '<button class="btn-sm btn-danger" data-action="delete-project" data-id="' + p._id + '">מחק</button>' +
        '</td>';
      tbody.appendChild(tr);
    }
    updateSortIndicators();
  }

  function trafficDot(val) {
    var cls = 'traffic-none';
    if (val === 'green') cls = 'traffic-green';
    else if (val === 'yellow') cls = 'traffic-yellow';
    else if (val === 'red') cls = 'traffic-red';
    return '<span class="traffic-light ' + cls + '"></span>';
  }

  function updateSortIndicators() {
    var ths = document.querySelectorAll('#projects-table thead th');
    for (var i = 0; i < ths.length; i++) {
      ths[i].classList.remove('sort-asc', 'sort-desc');
      if (ths[i].dataset.col === currentSort.col) {
        ths[i].classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');
      }
    }
  }

  // ── Render: Project Detail ──

  function showProjectDetail(id) {
    currentProjectId = id;
    var entry = findEntry(id);
    if (!entry) return;

    document.getElementById('view-projects').hidden = true;
    document.getElementById('view-detail').hidden = false;

    var info = document.getElementById('project-info');
    info.innerHTML = '';
    PROJECT_FIELDS.forEach(function (f) {
      var val = entry.project[f.key] || '';
      var div = document.createElement('div');
      div.className = 'field';
      if (f.type === 'traffic') {
        div.innerHTML = '<span class="field-label">' + esc(f.label) + '</span>' +
          '<span class="field-value">' + trafficDot(val) + ' ' + trafficLabel(val) + '</span>';
      } else if (f.type === 'url' && val) {
        div.innerHTML = '<span class="field-label">' + esc(f.label) + '</span>' +
          '<span class="field-value"><a href="' + esc(val) + '" target="_blank" dir="ltr">' + esc(val) + '</a></span>';
      } else {
        div.innerHTML = '<span class="field-label">' + esc(f.label) + '</span>' +
          '<span class="field-value">' + esc(val || '—') + '</span>';
      }
      info.appendChild(div);
    });

    renderOpinionsTable(entry);
  }

  function renderOpinionsTable(entry) {
    var tbody = document.querySelector('#opinions-table tbody');
    tbody.innerHTML = '';
    for (var i = 0; i < entry.opinions.length; i++) {
      var o = entry.opinions[i];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(o['שמאי מטעם היזם']) + '</td>' +
        '<td>' + esc(o['שמאי מטעם העירייה']) + '</td>' +
        '<td>' + esc(o['תאריך קבלת בקשה']) + '</td>' +
        '<td>' + esc(o['תאריך קבלת חוו"ד']) + '</td>' +
        '<td>' + esc(o['רווחיות (%)']) + '</td>' +
        '<td>' + esc(o['הערות / סטטוס']) + '</td>' +
        '<td>' + esc(o['מימוש']) + '</td>' +
        '<td>' + esc(o['ת.ב.']) + '</td>' +
        '<td class="actions">' +
          '<button class="btn-sm btn-secondary" data-action="edit-opinion" data-id="' + o._id + '">ערוך</button> ' +
          '<button class="btn-sm btn-danger" data-action="delete-opinion" data-id="' + o._id + '">מחק</button>' +
        '</td>';
      tbody.appendChild(tr);
    }
  }

  function goBackToList() {
    currentProjectId = null;
    document.getElementById('view-detail').hidden = true;
    document.getElementById('view-projects').hidden = false;
    renderProjectsTable();
  }

  // ── Modal ──

  function showModal(title, fields, values, onSave) {
    document.getElementById('modal-title').textContent = title;
    var form = document.getElementById('modal-form');
    form.innerHTML = '';
    fields.forEach(function (f) {
      var label = document.createElement('label');
      label.textContent = f.label;
      var input;
      if (f.type === 'traffic') {
        input = document.createElement('select');
        TRAFFIC_OPTIONS.forEach(function (opt) {
          var option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if ((values[f.key] || '') === opt.value) option.selected = true;
          input.appendChild(option);
        });
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.value = values[f.key] || '';
      } else {
        input = document.createElement('input');
        input.type = f.type === 'url' ? 'url' : 'text';
        if (f.type === 'url') input.dir = 'ltr';
        input.value = values[f.key] || '';
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.name = f.key;
      label.appendChild(input);
      form.appendChild(label);
    });
    document.getElementById('modal-overlay').hidden = false;

    var saveBtn = document.getElementById('btn-modal-save');
    var cancelBtn = document.getElementById('btn-modal-cancel');

    function cleanup() {
      saveBtn.onclick = null;
      cancelBtn.onclick = null;
      document.getElementById('modal-overlay').hidden = true;
    }

    saveBtn.onclick = function () {
      var data = {};
      fields.forEach(function (f) {
        var el = form.querySelector('[name="' + f.key + '"]');
        data[f.key] = el ? el.value : '';
      });
      cleanup();
      onSave(data);
    };

    cancelBtn.onclick = cleanup;
  }

  // ── Confirm ──

  function confirmAction(message) {
    return new Promise(function (resolve) {
      document.getElementById('confirm-message').textContent = message;
      document.getElementById('confirm-overlay').hidden = false;
      document.getElementById('btn-confirm-yes').onclick = function () {
        document.getElementById('confirm-overlay').hidden = true;
        resolve(true);
      };
      document.getElementById('btn-confirm-no').onclick = function () {
        document.getElementById('confirm-overlay').hidden = true;
        resolve(false);
      };
    });
  }

  // ── CRUD ──

  function addProject(data) {
    var entry = {
      project: Object.assign({ _id: genId() }, data),
      opinions: []
    };
    appData.projects.push(entry);
    saveData();
    renderProjectsTable();
    showToast('פרויקט נוסף בהצלחה');
  }

  function updateProject(id, data) {
    var entry = findEntry(id);
    if (!entry) return;
    Object.assign(entry.project, data);
    saveData();
    if (currentProjectId === id) showProjectDetail(id);
    else renderProjectsTable();
    showToast('פרויקט עודכן');
  }

  async function deleteProject(id) {
    var entry = findEntry(id);
    if (!entry) return;
    var ok = await confirmAction('למחוק את הפרויקט "' + (entry.project['שם היזם'] || '') + '" וכל חוות הדעת שלו?');
    if (!ok) return;
    appData.projects = appData.projects.filter(function (e) { return e.project._id !== id; });
    saveData();
    if (currentProjectId === id) goBackToList();
    else renderProjectsTable();
    showToast('פרויקט נמחק');
  }

  function addOpinion(projectId, data) {
    var entry = findEntry(projectId);
    if (!entry) return;
    entry.opinions.push(Object.assign({ _id: genId() }, data));
    saveData();
    renderOpinionsTable(entry);
    showToast('חוות דעת נוספה');
  }

  function updateOpinion(projectId, opinionId, data) {
    var entry = findEntry(projectId);
    if (!entry) return;
    var op = entry.opinions.find(function (o) { return o._id === opinionId; });
    if (!op) return;
    Object.assign(op, data);
    saveData();
    renderOpinionsTable(entry);
    showToast('חוות דעת עודכנה');
  }

  async function deleteOpinion(projectId, opinionId) {
    var entry = findEntry(projectId);
    if (!entry) return;
    var ok = await confirmAction('למחוק חוות דעת זו?');
    if (!ok) return;
    entry.opinions = entry.opinions.filter(function (o) { return o._id !== opinionId; });
    saveData();
    renderOpinionsTable(entry);
    showToast('חוות דעת נמחקה');
  }

  // ── Export / Import ──

  function exportJSON() {
    var blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'hashbacha-export-' + d.getFullYear() + '-' +
      pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('קובץ יוצא בהצלחה');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = async function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.projects)) {
          showToast('קובץ לא תקין – חסר מערך projects');
          return;
        }
        var ok = await confirmAction('לייבא קובץ? הנתונים הנוכחיים יוחלפו.');
        if (!ok) return;
        appData = data;
        appData.settings = appData.settings || {};
        saveData();
        goBackToList();
        showToast('נתונים יובאו בהצלחה');
      } catch (err) {
        showToast('שגיאה בקריאת הקובץ');
      }
    };
    reader.readAsText(file);
  }

  // ── Email ──

  async function notifyNewProject(entry) {
    if (serverMode && appData.emailConfigured) {
      try {
        var res = await fetch('/api/notify/new-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: entry, to: appData.settings.ilanitEmail })
        });
        var result = await res.json();
        if (result.sent) {
          showToast('מייל נשלח בהצלחה');
        } else {
          openMailto(result.to, result.subject, result.text);
        }
      } catch (e) {
        showToast('שגיאה בשליחת מייל');
      }
    } else {
      var to = appData.settings.ilanitEmail || '';
      var subject = 'נוסף פרויקט חדש ונדרשת חוות דעת';
      var p = entry.project || entry;
      var text = 'שלום,\n\nנוסף פרויקט חדש ונדרשת חוות דעת.\n\n' +
        'שם היזם: ' + (p['שם היזם'] || '') + '\n' +
        'כתובת הפרויקט: ' + (p['כתובת הפרויקט'] || '') + '\n' +
        "מספר תכנית: " + (p["מס' תכנית/ מס זמני"] || '') + '\n' +
        'שם התכנית: ' + (p['שם התכנית'] || '') + '\n' +
        'קישור: ' + (p['קישור'] || '') + '\n\n' +
        'נא להפנות לשמאי מוסמך לקבלת חוות דעת מטעם העירייה.';
      openMailto(to, subject, text);
    }
  }

  async function notifyOpinionReady(entry) {
    if (serverMode && appData.emailConfigured) {
      try {
        var res = await fetch('/api/notify/opinion-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: entry, to: appData.settings.planningEmail })
        });
        var result = await res.json();
        if (result.sent) {
          showToast('מייל נשלח בהצלחה');
        } else {
          openMailto(result.to, result.subject, result.text);
        }
      } catch (e) {
        showToast('שגיאה בשליחת מייל');
      }
    } else {
      var to = appData.settings.planningEmail || '';
      var subject = 'קיימת חוות דעת מטעם העירייה';
      var p = entry.project || entry;
      var text = 'שלום,\n\nעודכנה חוות דעת מטעם העירייה עבור הפרויקט.\n\n' +
        'שם היזם: ' + (p['שם היזם'] || '') + '\n' +
        'כתובת הפרויקט: ' + (p['כתובת הפרויקט'] || '') + '\n' +
        "מספר תכנית: " + (p["מס' תכנית/ מס זמני"] || '') + '\n' +
        'שם התכנית: ' + (p['שם התכנית'] || '') + '\n' +
        'קישור: ' + (p['קישור'] || '');
      openMailto(to, subject, text);
    }
  }

  function openMailto(to, subject, body) {
    var href = 'mailto:' + encodeURIComponent(to || '') +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
    window.open(href, '_blank');
    showToast('נפתח חלון מייל');
  }

  // ── Settings ──

  function showSettings() {
    showModal('הגדרות', [
      { key: 'ilanitEmail', label: 'מייל אילנית', type: 'text' },
      { key: 'planningEmail', label: 'מייל אגף תכנון', type: 'text' }
    ], appData.settings, function (data) {
      appData.settings.ilanitEmail = data.ilanitEmail || '';
      appData.settings.planningEmail = data.planningEmail || '';
      saveData();
      showToast('הגדרות נשמרו');
    });
  }

  // ── Events ──

  function wireEvents() {
    document.getElementById('search-input').addEventListener('input', function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(renderProjectsTable, 300);
    });

    document.getElementById('btn-add-project').addEventListener('click', function () {
      showModal('פרויקט חדש', PROJECT_FIELDS, {}, function (data) {
        addProject(data);
      });
    });

    document.getElementById('btn-export').addEventListener('click', exportJSON);

    document.getElementById('import-file').addEventListener('change', function (e) {
      if (e.target.files.length) {
        importJSON(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.getElementById('btn-settings').addEventListener('click', showSettings);

    // Sort headers
    document.querySelectorAll('#projects-table thead th[data-col]').forEach(function (th) {
      th.addEventListener('click', function () {
        var col = th.dataset.col;
        if (currentSort.col === col) {
          currentSort.asc = !currentSort.asc;
        } else {
          currentSort.col = col;
          currentSort.asc = true;
        }
        renderProjectsTable();
      });
    });

    // Table actions (delegated)
    document.getElementById('projects-table').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (btn) {
        e.stopPropagation();
        var action = btn.dataset.action;
        var id = btn.dataset.id;
        if (action === 'view') showProjectDetail(id);
        else if (action === 'edit-project') {
          var entry = findEntry(id);
          if (entry) showModal('עריכת פרויקט', PROJECT_FIELDS, entry.project, function (data) {
            updateProject(id, data);
          });
        }
        else if (action === 'delete-project') deleteProject(id);
        return;
      }
      var row = e.target.closest('tr[data-id]');
      if (row) showProjectDetail(row.dataset.id);
    });

    // Detail view actions
    document.getElementById('btn-back').addEventListener('click', goBackToList);

    document.getElementById('btn-edit-project').addEventListener('click', function () {
      var entry = findEntry(currentProjectId);
      if (entry) showModal('עריכת פרויקט', PROJECT_FIELDS, entry.project, function (data) {
        updateProject(currentProjectId, data);
      });
    });

    document.getElementById('btn-add-opinion').addEventListener('click', function () {
      showModal('חוות דעת חדשה', OPINION_FIELDS, {}, function (data) {
        addOpinion(currentProjectId, data);
      });
    });

    document.getElementById('btn-notify-new').addEventListener('click', function () {
      var entry = findEntry(currentProjectId);
      if (entry) notifyNewProject(entry);
    });

    document.getElementById('btn-notify-ready').addEventListener('click', function () {
      var entry = findEntry(currentProjectId);
      if (entry) notifyOpinionReady(entry);
    });

    // Opinion table actions (delegated)
    document.getElementById('opinions-table').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var opId = btn.dataset.id;
      if (action === 'edit-opinion') {
        var entry = findEntry(currentProjectId);
        if (!entry) return;
        var op = entry.opinions.find(function (o) { return o._id === opId; });
        if (op) showModal('עריכת חוות דעת', OPINION_FIELDS, op, function (data) {
          updateOpinion(currentProjectId, opId, data);
        });
      } else if (action === 'delete-opinion') {
        deleteOpinion(currentProjectId, opId);
      }
    });

    // Close modal on overlay click
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) {
        this.hidden = true;
      }
    });

    document.getElementById('confirm-overlay').addEventListener('click', function (e) {
      if (e.target === this) {
        this.hidden = true;
      }
    });
  }

  // ── Helpers ──

  function findEntry(id) {
    return appData.projects.find(function (e) { return e.project._id === id; });
  }

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function esc(str) {
    if (!str && str !== 0) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  function trafficLabel(val) {
    if (val === 'green') return 'ירוק';
    if (val === 'yellow') return 'צהוב';
    if (val === 'red') return 'אדום';
    return '—';
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function showToast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    el.className = 'show';
    setTimeout(function () {
      el.className = 'hide';
      setTimeout(function () { el.hidden = true; }, 300);
    }, 2500);
  }

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', init);
})();
