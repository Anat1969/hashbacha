(function () {
  'use strict';

  var appData = null;
  var serverMode = false;
  var currentSort = { col: null, asc: true };
  var currentProjectId = null;
  var searchTimeout = null;

  var PROJECT_FIELDS = [
    { key: 'רובע', label: 'רובע', type: 'text' },
    { key: 'שם היזם', label: 'שם היזם', type: 'text' },
    { key: 'כתובת הפרויקט', label: 'כתובת הפרויקט', type: 'text' },
    { key: "מס' תכנית/ מס זמני", label: "מס׳ תכנית / מס׳ זמני", type: 'text' },
    { key: 'שם התכנית', label: 'שם התכנית', type: 'text' },
    { key: 'סטטוס רמזור', label: 'סטטוס', type: 'traffic' },
    { key: 'קישור', label: 'קישור', type: 'url' }
  ];

  var OPINION_FIELDS = [
    { key: 'שמאי מטעם היזם', label: 'שמאי מטעם היזם', type: 'text' },
    { key: 'שמאי מטעם העירייה', label: 'שמאי מטעם העירייה', type: 'text' },
    { key: 'תאריך קבלת בקשה', label: 'תאריך קבלת בקשה', type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'תאריך קבלת חוו"ד', label: 'תאריך קבלת חוו״ד', type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'דו"ח אחרון מעודכן', label: 'דו״ח אחרון מעודכן', type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'מס יחידות קימיות', label: 'מס׳ יחידות קיימות', type: 'text' },
    { key: 'סה"כ יחידות בתכנית', label: 'סה״כ יחידות בתכנית', type: 'text' },
    { key: 'רווחיות יזם (%)', label: 'רווחיות יזם (%)', type: 'text' },
    { key: 'רווחיות עירייה (%)', label: 'רווחיות עירייה (%)', type: 'text' },
    { key: 'הערות / סטטוס', label: 'הערות / סטטוס', type: 'textarea' },
    { key: 'מימוש', label: 'מימוש', type: 'text' },
    { key: 'ת.ב.', label: 'ת.ב.', type: 'text' },
    { key: 'שמאי לתבע', label: 'שמאי לתבע', type: 'text' }
  ];

  var TRAFFIC_OPTIONS = [
    { value: '', label: 'ללא' },
    { value: 'green', label: 'ירוק' },
    { value: 'yellow', label: 'צהוב' },
    { value: 'red', label: 'אדום' }
  ];

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
    migrateProfit();
    renderProjectsTable();
    wireEvents();
  }

  function migrateProfit() {
    var migrated = false;
    appData.projects.forEach(function (entry) {
      entry.opinions.forEach(function (o) {
        if (('רווחיות (%)' in o) && !('רווחיות יזם (%)' in o)) {
          o['רווחיות יזם (%)'] = o['רווחיות (%)'];
          o['רווחיות עירייה (%)'] = '';
          delete o['רווחיות (%)'];
          migrated = true;
        }
      });
    });
    if (migrated) saveData();
  }

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
        '<td>' + esc(p['רובע']) + '</td>' +
        '<td>' + esc(p['שם היזם']) + '</td>' +
        '<td>' + esc(p['כתובת הפרויקט']) + '</td>' +
        '<td>' + esc(p["מס' תכנית/ מס זמני"]) + '</td>' +
        '<td>' + esc(p['שם התכנית']) + '</td>' +
        '<td>' + esc(trafficLabel(p['סטטוס רמזור'])) + '</td>' +
        '<td>' + entry.opinions.length + '</td>' +
        '<td class="actions">' +
          '<button class="btn-sm" data-action="view" data-id="' + p._id + '">צפה</button> ' +
          '<button class="btn-sm" data-action="edit-project" data-id="' + p._id + '">ערוך</button> ' +
          '<button class="btn-sm" data-action="delete-project" data-id="' + p._id + '">מחק</button>' +
        '</td>';
      tbody.appendChild(tr);
    }
    updateSortIndicators();
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
          '<span class="field-value">' + esc(trafficLabel(val)) + '</span>';
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
      var gap = calcGap(o['רווחיות יזם (%)'], o['רווחיות עירייה (%)']);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(o['שמאי מטעם היזם']) + '</td>' +
        '<td>' + esc(o['שמאי מטעם העירייה']) + '</td>' +
        '<td>' + esc(o['תאריך קבלת בקשה']) + '</td>' +
        '<td>' + esc(o['תאריך קבלת חוו"ד']) + '</td>' +
        '<td>' + esc(o['דו"ח אחרון מעודכן']) + '</td>' +
        '<td>' + esc(o['מס יחידות קימיות']) + '</td>' +
        '<td>' + esc(o['סה"כ יחידות בתכנית']) + '</td>' +
        '<td>' + esc(o['רווחיות יזם (%)']) + '</td>' +
        '<td>' + esc(o['רווחיות עירייה (%)']) + '</td>' +
        '<td class="' + gap.cls + '">' + esc(gap.value) + '</td>' +
        '<td>' + esc(o['הערות / סטטוס']) + '</td>' +
        '<td>' + esc(o['מימוש']) + '</td>' +
        '<td>' + esc(o['ת.ב.']) + '</td>' +
        '<td>' + esc(o['שמאי לתבע']) + '</td>' +
        '<td class="actions">' +
          '<button class="btn-sm" data-action="edit-opinion" data-id="' + o._id + '">ערוך</button> ' +
          '<button class="btn-sm" data-action="delete-opinion" data-id="' + o._id + '">מחק</button>' +
        '</td>';
      tbody.appendChild(tr);
    }
  }

  function calcGap(devStr, cityStr) {
    var dev = parsePercent(devStr);
    var city = parsePercent(cityStr);
    if (dev === null || city === null) return { value: '', cls: '' };
    var gap = dev - city;
    if (Math.abs(gap) < 0.01) return { value: '0%', cls: '' };
    if (gap > 0) return { value: '+' + gap.toFixed(1) + '%', cls: 'gap-developer' };
    return { value: gap.toFixed(1) + '%', cls: 'gap-city' };
  }

  function parsePercent(str) {
    if (!str) return null;
    var cleaned = String(str).replace(/%/g, '').trim();
    var num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function goBackToList() {
    currentProjectId = null;
    document.getElementById('view-detail').hidden = true;
    document.getElementById('view-projects').hidden = false;
    renderProjectsTable();
  }

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

  // ── Excel Export / Import ──

  function exportExcel() {
    var headers = [
      '#', 'רובע', 'שם היזם', 'כתובת הפרויקט', "מס' תכנית/ מס זמני",
      'שם התכנית', 'סטטוס רמזור', 'קישור',
      'שמאי מטעם היזם', 'שמאי מטעם העירייה',
      'תאריך קבלת בקשה', 'תאריך קבלת חוו"ד',
      'דו"ח אחרון מעודכן', 'מס יחידות קימיות', 'סה"כ יחידות בתכנית',
      'רווחיות יזם (%)', 'רווחיות עירייה (%)',
      'הערות / סטטוס', 'מימוש', 'ת.ב.', 'שמאי לתבע'
    ];
    var rows = [headers];
    var rowNum = 0;
    appData.projects.forEach(function (entry) {
      var p = entry.project;
      if (entry.opinions.length === 0) {
        rowNum++;
        rows.push([
          rowNum, p['רובע'] || '', p['שם היזם'] || '', p['כתובת הפרויקט'] || '',
          p["מס' תכנית/ מס זמני"] || '', p['שם התכנית'] || '',
          trafficLabel(p['סטטוס רמזור']), p['קישור'] || '',
          '', '', '', '', '', '', '', '', '', '', '', '', ''
        ]);
      } else {
        entry.opinions.forEach(function (o) {
          rowNum++;
          rows.push([
            rowNum, p['רובע'] || '', p['שם היזם'] || '', p['כתובת הפרויקט'] || '',
            p["מס' תכנית/ מס זמני"] || '', p['שם התכנית'] || '',
            trafficLabel(p['סטטוס רמזור']), p['קישור'] || '',
            o['שמאי מטעם היזם'] || '', o['שמאי מטעם העירייה'] || '',
            o['תאריך קבלת בקשה'] || '', o['תאריך קבלת חוו"ד'] || '',
            o['דו"ח אחרון מעודכן'] || '', o['מס יחידות קימיות'] || '',
            o['סה"כ יחידות בתכנית'] || '',
            o['רווחיות יזם (%)'] || '', o['רווחיות עירייה (%)'] || '',
            o['הערות / סטטוס'] || '', o['מימוש'] || '',
            o['ת.ב.'] || '', o['שמאי לתבע'] || ''
          ]);
        });
      }
    });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = headers.map(function () { return { wch: 16 }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'נתונים');
    var d = new Date();
    XLSX.writeFile(wb, 'hashbacha-' + d.getFullYear() + '-' +
      pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.xlsx');
    showToast('קובץ Excel יוצא בהצלחה');
  }

  function importExcel(file) {
    var reader = new FileReader();
    reader.onload = async function (e) {
      try {
        var wb = XLSX.read(e.target.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) {
          showToast('הקובץ ריק');
          return;
        }
        var ok = await confirmAction('לייבא קובץ Excel? הנתונים הנוכחיים יוחלפו.');
        if (!ok) return;

        var hdr = rows[0];
        var colIdx = {};
        hdr.forEach(function (h, i) { colIdx[String(h).trim()] = i; });

        var projectsMap = {};
        var projectsList = [];

        for (var r = 1; r < rows.length; r++) {
          var row = rows[r];
          if (!row || row.length === 0) continue;
          var val = function (key) {
            var i = colIdx[key];
            return (i !== undefined && row[i] != null) ? String(row[i]) : '';
          };

          var projectKey = (val('שם היזם') + '||' + val("מס' תכנית/ מס זמני")).toLowerCase();
          var entry;
          if (projectsMap[projectKey]) {
            entry = projectsMap[projectKey];
          } else {
            entry = {
              project: {
                _id: genId(),
                'רובע': val('רובע'),
                'שם היזם': val('שם היזם'),
                'כתובת הפרויקט': val('כתובת הפרויקט'),
                "מס' תכנית/ מס זמני": val("מס' תכנית/ מס זמני"),
                'שם התכנית': val('שם התכנית'),
                'סטטוס רמזור': reverseTrafficLabel(val('סטטוס רמזור')),
                'קישור': val('קישור')
              },
              opinions: []
            };
            projectsMap[projectKey] = entry;
            projectsList.push(entry);
          }

          var hasOpinionData = val('שמאי מטעם היזם') || val('שמאי מטעם העירייה') ||
            val('תאריך קבלת בקשה') || val('תאריך קבלת חוו"ד') ||
            val('רווחיות יזם (%)') || val('רווחיות עירייה (%)') ||
            val('הערות / סטטוס') || val('מימוש') || val('ת.ב.') || val('שמאי לתבע');

          if (hasOpinionData) {
            entry.opinions.push({
              _id: genId(),
              'שמאי מטעם היזם': val('שמאי מטעם היזם'),
              'שמאי מטעם העירייה': val('שמאי מטעם העירייה'),
              'תאריך קבלת בקשה': val('תאריך קבלת בקשה'),
              'תאריך קבלת חוו"ד': val('תאריך קבלת חוו"ד'),
              'דו"ח אחרון מעודכן': val('דו"ח אחרון מעודכן'),
              'מס יחידות קימיות': val('מס יחידות קימיות'),
              'סה"כ יחידות בתכנית': val('סה"כ יחידות בתכנית'),
              'רווחיות יזם (%)': val('רווחיות יזם (%)'),
              'רווחיות עירייה (%)': val('רווחיות עירייה (%)'),
              'הערות / סטטוס': val('הערות / סטטוס'),
              'מימוש': val('מימוש'),
              'ת.ב.': val('ת.ב.'),
              'שמאי לתבע': val('שמאי לתבע')
            });
          }
        }

        appData = {
          settings: appData.settings || {},
          projects: projectsList
        };
        saveData();
        goBackToList();
        showToast('נתונים יובאו בהצלחה (' + projectsList.length + ' פרויקטים)');
      } catch (err) {
        showToast('שגיאה בקריאת הקובץ');
      }
    };
    reader.readAsArrayBuffer(file);
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

    document.getElementById('btn-export').addEventListener('click', exportExcel);

    document.getElementById('import-file').addEventListener('change', function (e) {
      if (e.target.files.length) {
        importExcel(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.getElementById('btn-settings').addEventListener('click', showSettings);

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

  function reverseTrafficLabel(text) {
    if (!text) return '';
    var t = text.trim();
    if (t === 'ירוק') return 'green';
    if (t === 'צהוב') return 'yellow';
    if (t === 'אדום') return 'red';
    return '';
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

  document.addEventListener('DOMContentLoaded', init);
})();
