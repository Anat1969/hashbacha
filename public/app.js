(function () {
  'use strict';

  var appData = null;
  var serverMode = false;
  var currentSort = { col: null, asc: true };
  var currentProjectId = null;
  var searchTimeout = null;
  var currentEditingOpinionId = null;
  var currentEditingProjectId = null;
  var expandedProjectId = null;
  var currentGroupBy = null;
  var currentAnalyticsTab = 'gap';
  var chartInstances = [];
  var PROJECT_TABLE_COLSPAN = 10;

  var PROJECT_FIELDS = [
    { key: 'רובע', label: 'רובע', type: 'text' },
    { key: 'שם היזם', label: 'שם היזם', type: 'text' },
    { key: 'כתובת הפרויקט', label: 'כתובת הפרויקט', type: 'text' },
    { key: "מס' תכנית/ מס זמני", label: "מס׳ תכנית / מס׳ זמני", type: 'text' },
    { key: 'שם התכנית', label: 'שם התכנית', type: 'text' },
    { key: 'סטטוס רמזור', label: 'סטטוס', type: 'status' },
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

  var STATUS_OPTIONS = [
    { value: '', label: 'ללא', color: '' },
    { value: 'הוגש', label: 'הוגש', color: '#c0392b' },
    { value: 'בטיפול', label: 'בטיפול', color: '#e67e22' },
    { value: 'בוצע', label: 'בוצע', color: '#27ae60' }
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
    migrateStatusValues();
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

  function migrateStatusValues() {
    var migrated = false;
    var map = { 'green': 'בוצע', 'yellow': 'בטיפול', 'red': 'הוגש' };
    appData.projects.forEach(function (entry) {
      var val = entry.project['סטטוס רמזור'];
      if (val && map[val]) {
        entry.project['סטטוס רמזור'] = map[val];
        migrated = true;
      }
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
      } else if (col === 'avgProfit') {
        va = calcAvgDevProfit(a);
        vb = calcAvgDevProfit(b);
        va = va !== null ? va : -999;
        vb = vb !== null ? vb : -999;
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

    var groups = null;
    if (currentGroupBy) {
      groups = groupEntries(sorted, currentGroupBy);
    } else {
      groups = [{ label: null, entries: sorted }];
    }

    var rowNum = 0;
    groups.forEach(function (group) {
      if (group.label !== null) {
        var gtr = document.createElement('tr');
        gtr.className = 'group-header-row';
        gtr.innerHTML = '<td colspan="' + PROJECT_TABLE_COLSPAN + '">' + esc(group.label) + ' (' + group.entries.length + ')</td>';
        tbody.appendChild(gtr);
      }
      for (var i = 0; i < group.entries.length; i++) {
        rowNum++;
        var entry = group.entries[i];
        var p = entry.project;
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', p._id);
        if (expandedProjectId === p._id) tr.classList.add('expanded');
        var sc = statusColor(p['סטטוס רמזור']);
        var avgP = calcAvgDevProfit(entry);
        var avgDisplay = avgP !== null ? avgP.toFixed(1) + '%' : '—';
        var avgColor = avgP !== null ? profitColorByThreshold(avgP) : '';
        tr.innerHTML =
          '<td>' + rowNum + ' <span class="expand-arrow">&#9654;</span></td>' +
          '<td>' + esc(p['רובע']) + '</td>' +
          '<td>' + esc(p['שם היזם']) + '</td>' +
          '<td>' + esc(p['כתובת הפרויקט']) + '</td>' +
          '<td>' + esc(p["מס' תכנית/ מס זמני"]) + '</td>' +
          '<td>' + esc(p['שם התכנית']) + '</td>' +
          '<td' + (sc ? ' style="color:' + sc + ';font-weight:600"' : '') + '>' + esc(statusLabel(p['סטטוס רמזור'])) + '</td>' +
          '<td>' + entry.opinions.length + '</td>' +
          '<td' + (avgColor ? ' style="color:' + avgColor + ';font-weight:600"' : '') + '>' + avgDisplay + '</td>' +
          '<td class="actions">' +
            '<button class="btn-sm" data-action="toggle-expand" data-id="' + p._id + '">צפה</button> ' +
            '<button class="btn-sm" data-action="edit-project" data-id="' + p._id + '">ערוך</button> ' +
            '<button class="btn-sm" data-action="delete-project" data-id="' + p._id + '">מחק</button>' +
          '</td>';
        tbody.appendChild(tr);
        if (expandedProjectId === p._id) {
          renderExpandedRow(entry, tbody);
        }
      }
    });
    updateSortIndicators();
  }

  function groupEntries(entries, by) {
    var map = {};
    var order = [];
    entries.forEach(function (entry) {
      var key;
      if (by === 'avgProfit') {
        var avg = calcAvgDevProfit(entry);
        if (avg === null) key = 'ללא נתונים';
        else if (avg < 10) key = '0-10%';
        else if (avg < 15) key = '10-15%';
        else if (avg < 20) key = '15-20%';
        else key = '20%+';
      } else {
        key = entry.project[by] || 'ללא';
      }
      if (!map[key]) {
        map[key] = [];
        order.push(key);
      }
      map[key].push(entry);
    });
    return order.map(function (k) { return { label: k, entries: map[k] }; });
  }

  function renderExpandedRow(entry, tbody) {
    var tr = document.createElement('tr');
    tr.className = 'expanded-detail-row';
    tr.setAttribute('data-expanded-for', entry.project._id);
    var td = document.createElement('td');
    td.setAttribute('colspan', PROJECT_TABLE_COLSPAN);
    renderExpandedOpinions(entry, td);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function renderExpandedOpinions(entry, td) {
    var html = '<div class="expanded-opinions-wrap"><table>' +
      '<thead>' +
      '<tr class="column-group-row">' +
      '<th rowspan="2">#</th>' +
      '<th colspan="2" class="col-group col-group-appraisers">שמאים</th>' +
      '<th colspan="3" class="col-group col-group-dates">תאריכים</th>' +
      '<th colspan="2" class="col-group col-group-units">יחידות</th>' +
      '<th colspan="3" class="col-group col-group-profit">רווחיות</th>' +
      '<th colspan="4" class="col-group col-group-other">אחר</th>' +
      '<th rowspan="2">פעולות</th></tr>' +
      '<tr><th>שמאי יזם</th><th>שמאי עירייה</th>' +
      '<th>תאריך בקשה</th><th>תאריך חוו״ד</th><th>דו״ח מעודכן</th>' +
      '<th>יח׳ קיימות</th><th>יח׳ בתכנית</th>' +
      '<th>רווחיות יזם (%)</th><th>רווחיות עירייה (%)</th><th>פער (%)</th>' +
      '<th>הערות / סטטוס</th><th>מימוש</th><th>ת.ב.</th><th>שמאי לתבע</th></tr>' +
      '</thead><tbody>';
    for (var i = 0; i < entry.opinions.length; i++) {
      var o = entry.opinions[i];
      var gap = calcGap(o['רווחיות יזם (%)'], o['רווחיות עירייה (%)']);
      html += '<tr>' +
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
          '<button class="btn-sm" data-action="edit-opinion-expanded" data-id="' + o._id + '" data-project-id="' + entry.project._id + '">ערוך</button> ' +
          '<button class="btn-sm" data-action="delete-opinion-expanded" data-id="' + o._id + '" data-project-id="' + entry.project._id + '">מחק</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    html += '<div class="expanded-actions">' +
      '<button class="btn-sm" data-action="add-opinion-expanded" data-project-id="' + entry.project._id + '">+ חוות דעת</button> ' +
      '<button class="btn-sm" data-action="view-full-detail" data-id="' + entry.project._id + '">פרטים מלאים &#8592;</button>' +
      '</div>';
    td.innerHTML = html;
  }

  function toggleProjectExpand(id) {
    if (expandedProjectId === id) {
      expandedProjectId = null;
    } else {
      expandedProjectId = id;
    }
    renderProjectsTable();
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
    currentEditingOpinionId = null;
    var entry = findEntry(id);
    if (!entry) return;

    document.getElementById('view-projects').hidden = true;
    document.getElementById('view-detail').hidden = false;
    document.getElementById('view-analytics').hidden = true;

    var info = document.getElementById('project-info');
    info.classList.remove('editing');
    info.innerHTML = '';
    var editBar = document.getElementById('inline-edit-bar');
    if (editBar) editBar.remove();

    document.getElementById('btn-edit-project').hidden = false;

    PROJECT_FIELDS.forEach(function (f) {
      var val = entry.project[f.key] || '';
      var div = document.createElement('div');
      div.className = 'field';
      div.setAttribute('data-key', f.key);
      if (f.type === 'status') {
        var sc = statusColor(val);
        div.innerHTML = '<span class="field-label">' + esc(f.label) + '</span>' +
          '<span class="field-value"' + (sc ? ' style="color:' + sc + ';font-weight:600"' : '') + '>' + esc(statusLabel(val)) + '</span>';
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

  // ── Inline Project Editing ──

  function startInlineProjectEdit(id) {
    var entry = findEntry(id);
    if (!entry) return;
    var info = document.getElementById('project-info');
    info.classList.add('editing');
    document.getElementById('btn-edit-project').hidden = true;

    var bar = document.createElement('div');
    bar.id = 'inline-edit-bar';
    bar.className = 'inline-edit-bar';
    bar.innerHTML = '<button class="btn-save" id="btn-inline-save-project">שמור</button>' +
      '<button class="btn-cancel" id="btn-inline-cancel-project">ביטול</button>';
    info.parentNode.insertBefore(bar, info);

    PROJECT_FIELDS.forEach(function (f) {
      var div = info.querySelector('[data-key="' + f.key + '"]');
      if (!div) return;
      var valSpan = div.querySelector('.field-value');
      if (!valSpan) return;
      var val = entry.project[f.key] || '';
      var input;
      if (f.type === 'status') {
        input = document.createElement('select');
        input.name = f.key;
        STATUS_OPTIONS.forEach(function (opt) {
          var option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if (val === opt.value) option.selected = true;
          input.appendChild(option);
        });
      } else {
        input = document.createElement('input');
        input.type = f.type === 'url' ? 'url' : 'text';
        if (f.type === 'url') input.dir = 'ltr';
        input.name = f.key;
        input.value = val;
      }
      valSpan.innerHTML = '';
      valSpan.appendChild(input);
    });

    document.getElementById('btn-inline-save-project').onclick = function () {
      var data = {};
      PROJECT_FIELDS.forEach(function (f) {
        var el = info.querySelector('[name="' + f.key + '"]');
        data[f.key] = el ? el.value : '';
      });
      updateProject(id, data);
    };
    document.getElementById('btn-inline-cancel-project').onclick = function () {
      showProjectDetail(id);
    };
  }

  // ── Inline Project Table Editing ──

  function startInlineProjectTableEdit(id) {
    if (currentEditingProjectId) {
      showToast('יש לסיים עריכה קודמת');
      return;
    }
    var entry = findEntry(id);
    if (!entry) return;
    currentEditingProjectId = id;

    var tbody = document.querySelector('#projects-table tbody');
    var row = tbody.querySelector('tr[data-id="' + id + '"]');
    if (!row) return;
    row.classList.add('editing-row');

    var cells = row.querySelectorAll('td');
    var p = entry.project;
    var fieldMap = [
      { idx: 1, key: 'רובע', type: 'text' },
      { idx: 2, key: 'שם היזם', type: 'text' },
      { idx: 3, key: 'כתובת הפרויקט', type: 'text' },
      { idx: 4, key: "מס' תכנית/ מס זמני", type: 'text' },
      { idx: 5, key: 'שם התכנית', type: 'text' },
      { idx: 6, key: 'סטטוס רמזור', type: 'status' }
    ];

    fieldMap.forEach(function (fm) {
      var cell = cells[fm.idx];
      if (!cell) return;
      var val = p[fm.key] || '';
      cell.innerHTML = '';
      if (fm.type === 'status') {
        var sel = document.createElement('select');
        sel.name = fm.key;
        STATUS_OPTIONS.forEach(function (opt) {
          var option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if (val === opt.value) option.selected = true;
          sel.appendChild(option);
        });
        cell.appendChild(sel);
      } else {
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.name = fm.key;
        inp.value = val;
        cell.appendChild(inp);
      }
    });

    var actionsCell = cells[cells.length - 1];
    actionsCell.innerHTML =
      '<button class="btn-sm btn-save" data-action="save-project-table" data-id="' + id + '">שמור</button> ' +
      '<button class="btn-sm btn-cancel" data-action="cancel-project-table">ביטול</button>';
  }

  function saveInlineProjectTableEdit(id) {
    var entry = findEntry(id);
    if (!entry) return;
    var tbody = document.querySelector('#projects-table tbody');
    var row = tbody.querySelector('tr.editing-row');
    if (!row) return;

    var data = {};
    var fields = ['רובע', 'שם היזם', 'כתובת הפרויקט', "מס' תכנית/ מס זמני", 'שם התכנית', 'סטטוס רמזור'];
    fields.forEach(function (key) {
      var el = row.querySelector('[name="' + key + '"]');
      data[key] = el ? el.value : '';
    });

    currentEditingProjectId = null;
    Object.assign(entry.project, data);
    saveData();
    renderProjectsTable();
    showToast('פרויקט עודכן');
  }

  function cancelInlineProjectTableEdit() {
    currentEditingProjectId = null;
    renderProjectsTable();
  }

  // ── Inline Opinion Editing ──

  function startInlineOpinionEdit(opinionId) {
    if (currentEditingOpinionId) {
      showToast('יש לסיים עריכה קודמת לפני התחלת עריכה חדשה');
      return;
    }
    var entry = findEntry(currentProjectId);
    if (!entry) return;
    var op = entry.opinions.find(function (o) { return o._id === opinionId; });
    if (!op) return;

    currentEditingOpinionId = opinionId;
    var tbody = document.querySelector('#opinions-table tbody');
    var rows = tbody.querySelectorAll('tr');
    var targetRow = null;
    for (var i = 0; i < rows.length; i++) {
      var btn = rows[i].querySelector('[data-action="edit-opinion"][data-id="' + opinionId + '"]');
      if (btn) { targetRow = rows[i]; break; }
    }
    if (!targetRow) return;

    targetRow.classList.add('editing-row');
    var cells = targetRow.querySelectorAll('td');
    var originalNotes = op['הערות / סטטוס'] || '';

    OPINION_FIELDS.forEach(function (f, idx) {
      var cell = cells[idx + 1];
      if (!cell) return;
      var val = op[f.key] || '';
      cell.innerHTML = '';
      var input;
      if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.value = val;
        input.setAttribute('data-original-notes', originalNotes);
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.name = f.key;
      cell.appendChild(input);
    });

    var actionsCell = cells[cells.length - 1];
    actionsCell.innerHTML = '<button class="btn-sm btn-save" data-action="save-opinion" data-id="' + opinionId + '">שמור</button> ' +
      '<button class="btn-sm btn-cancel" data-action="cancel-opinion">ביטול</button>';
  }

  function saveInlineOpinionEdit(opinionId) {
    var entry = findEntry(currentProjectId);
    if (!entry) return;
    var op = entry.opinions.find(function (o) { return o._id === opinionId; });
    if (!op) return;

    var tbody = document.querySelector('#opinions-table tbody');
    var row = tbody.querySelector('tr.editing-row');
    if (!row) return;

    var data = {};
    OPINION_FIELDS.forEach(function (f) {
      var el = row.querySelector('[name="' + f.key + '"]');
      data[f.key] = el ? el.value : '';
    });

    var notesEl = row.querySelector('[name="הערות / סטטוס"]');
    if (notesEl) {
      var originalNotes = notesEl.getAttribute('data-original-notes') || '';
      var newVal = data['הערות / סטטוס'];
      if (newVal !== originalNotes && newVal.trim()) {
        data['הערות / סטטוס'] = appendTimestampToNotes(originalNotes, newVal);
      }
    }

    currentEditingOpinionId = null;
    updateOpinion(currentProjectId, opinionId, data);
  }

  function cancelInlineOpinionEdit() {
    currentEditingOpinionId = null;
    var entry = findEntry(currentProjectId);
    if (entry) renderOpinionsTable(entry);
  }

  // ── Inline New Opinion ──

  function showInlineNewOpinionRow() {
    if (currentEditingOpinionId) {
      showToast('יש לסיים עריכה קודמת');
      return;
    }
    currentEditingOpinionId = '__new__';
    var tbody = document.querySelector('#opinions-table tbody');
    var tr = document.createElement('tr');
    tr.className = 'new-opinion-row';
    var rowNum = tbody.querySelectorAll('tr').length + 1;
    var html = '<td>' + rowNum + '</td>';
    OPINION_FIELDS.forEach(function (f) {
      html += '<td>';
      if (f.type === 'textarea') {
        html += '<textarea name="' + f.key + '"></textarea>';
      } else {
        html += '<input type="text" name="' + f.key + '"' +
          (f.placeholder ? ' placeholder="' + f.placeholder + '"' : '') + '>';
      }
      html += '</td>';
    });
    html += '<td>' + esc('') + '</td>';
    html += '<td class="actions">' +
      '<button class="btn-sm btn-save" data-action="save-new-opinion">שמור</button> ' +
      '<button class="btn-sm btn-cancel" data-action="cancel-new-opinion">ביטול</button></td>';
    tr.innerHTML = html;
    tbody.appendChild(tr);
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function saveInlineNewOpinion() {
    var tbody = document.querySelector('#opinions-table tbody');
    var row = tbody.querySelector('tr.new-opinion-row');
    if (!row) return;

    var data = {};
    OPINION_FIELDS.forEach(function (f) {
      var el = row.querySelector('[name="' + f.key + '"]');
      data[f.key] = el ? el.value : '';
    });

    if (data['הערות / סטטוס'] && data['הערות / סטטוס'].trim()) {
      data['הערות / סטטוס'] = todayStamp() + ': ' + data['הערות / סטטוס'].trim();
    }

    currentEditingOpinionId = null;
    addOpinion(currentProjectId, data);
  }

  function cancelInlineNewOpinion() {
    currentEditingOpinionId = null;
    var row = document.querySelector('#opinions-table tbody tr.new-opinion-row');
    if (row) row.remove();
  }

  // ── Auto-timestamp ──

  function todayStamp() {
    var d = new Date();
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function appendTimestampToNotes(originalNotes, newValue) {
    var stamp = todayStamp();
    if (!originalNotes || !originalNotes.trim()) {
      return stamp + ': ' + newValue.trim();
    }
    var added = newValue.substring(originalNotes.length).trim();
    if (added) {
      return originalNotes + '\n' + stamp + ': ' + added;
    }
    return stamp + ': ' + newValue.trim();
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

  function profitColorByThreshold(percent) {
    if (percent == null) return '#999';
    var p = Math.max(0, Math.min(30, percent));
    var r, g, b;
    if (p <= 15) {
      var ratio = p / 15;
      r = Math.round(39 + ratio * (241 - 39));
      g = Math.round(174 + ratio * (196 - 174));
      b = Math.round(96 + ratio * (15 - 96));
    } else {
      var ratio = (p - 15) / 15;
      r = Math.round(241 + ratio * (192 - 241));
      g = Math.round(196 + ratio * (57 - 196));
      b = Math.round(15 + ratio * (43 - 15));
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function calcAvgDevProfit(entry) {
    var vals = [];
    entry.opinions.forEach(function (o) {
      var v = parsePercent(o['רווחיות יזם (%)']);
      if (v !== null) vals.push(v);
    });
    if (vals.length === 0) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function goBackToList() {
    currentProjectId = null;
    currentEditingOpinionId = null;
    document.getElementById('view-detail').hidden = true;
    document.getElementById('view-analytics').hidden = true;
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
      if (f.type === 'status') {
        input = document.createElement('select');
        STATUS_OPTIONS.forEach(function (opt) {
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
          statusLabel(p['סטטוס רמזור']), p['קישור'] || '',
          '', '', '', '', '', '', '', '', '', '', '', '', ''
        ]);
      } else {
        entry.opinions.forEach(function (o) {
          rowNum++;
          rows.push([
            rowNum, p['רובע'] || '', p['שם היזם'] || '', p['כתובת הפרויקט'] || '',
            p["מס' תכנית/ מס זמני"] || '', p['שם התכנית'] || '',
            statusLabel(p['סטטוס רמזור']), p['קישור'] || '',
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
                'סטטוס רמזור': reverseStatusLabel(val('סטטוס רמזור')),
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

  // ── Analytics ──

  function showAnalytics() {
    document.getElementById('view-projects').hidden = true;
    document.getElementById('view-detail').hidden = true;
    document.getElementById('view-analytics').hidden = false;
    renderCharts();
    switchAnalyticsTab(currentAnalyticsTab);
  }

  function switchAnalyticsTab(tabName) {
    currentAnalyticsTab = tabName;
    var cards = document.querySelectorAll('#analytics-content .chart-card');
    cards.forEach(function (c) {
      if (c.getAttribute('data-tab') === tabName) {
        c.classList.add('active-chart');
      } else {
        c.classList.remove('active-chart');
      }
    });
    var tabs = document.querySelectorAll('.analytics-tab');
    tabs.forEach(function (t) {
      if (t.getAttribute('data-tab') === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
  }

  function collectAnalyticsData() {
    var items = [];
    appData.projects.forEach(function (entry) {
      var p = entry.project;
      entry.opinions.forEach(function (o) {
        var devProfit = parsePercent(o['רווחיות יזם (%)']);
        var cityProfit = parsePercent(o['רווחיות עירייה (%)']);
        items.push({
          projectName: p['שם היזם'] || '',
          address: p['כתובת הפרויקט'] || '',
          devAppraiser: o['שמאי מטעם היזם'] || '',
          cityAppraiser: o['שמאי מטעם העירייה'] || '',
          devProfit: devProfit,
          cityProfit: cityProfit,
          gap: (devProfit !== null && cityProfit !== null) ? devProfit - cityProfit : null,
          date: o['תאריך קבלת חוו"ד'] || o['תאריך קבלת בקשה'] || ''
        });
      });
    });
    return items;
  }

  function renderCharts() {
    chartInstances.forEach(function (c) { c.destroy(); });
    chartInstances = [];

    if (typeof Chart === 'undefined') {
      showToast('לא ניתן לטעון את ספריית הגרפים');
      return;
    }

    var data = collectAnalyticsData();

    renderGapChart(data);
    renderDevAppraiserChart(data);
    renderCityAppraiserChart(data);
    renderPairGapChart(data);
  }

  function renderGapChart(data) {
    var items = data.filter(function (d) { return d.devProfit !== null; });
    if (items.length === 0) {
      document.getElementById('explain-gap').textContent = 'אין מספיק נתונים להצגת גרף זה.';
      return;
    }

    var labels = items.map(function (d, i) { return (i + 1) + '. ' + d.projectName.substring(0, 15); });
    var devValues = items.map(function (d) { return d.devProfit; });
    var cityValues = items.map(function (d) { return d.cityProfit; });
    var hasCityData = cityValues.some(function (v) { return v !== null; });

    var datasets = [{
      label: 'רווחיות יזם (%)',
      data: devValues,
      borderColor: '#3498db',
      backgroundColor: 'rgba(52,152,219,0.1)',
      tension: 0.3,
      pointRadius: 4,
      pointBackgroundColor: devValues.map(function (v) {
        return profitColorByThreshold(v);
      })
    }];

    if (hasCityData) {
      datasets.push({
        label: 'רווחיות עירייה (%)',
        data: cityValues,
        borderColor: '#27ae60',
        backgroundColor: 'rgba(39,174,96,0.1)',
        tension: 0.3,
        pointRadius: 4
      });
    }

    datasets.push({
      label: 'סף 15%',
      data: devValues.map(function () { return 15; }),
      borderColor: 'rgba(241,196,15,0.6)',
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      tension: 0
    });

    var ctx = document.getElementById('chart-gap').getContext('2d');
    chartInstances.push(new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', rtl: true, labels: { font: { family: 'Segoe UI, Tahoma, Arial' } } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.dataset.label + ': ' + (context.parsed.y !== null ? context.parsed.y.toFixed(1) + '%' : 'N/A');
              }
            }
          }
        },
        scales: {
          y: { title: { display: true, text: 'אחוז רווחיות (%)' }, beginAtZero: true },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    }));

    var avgDev = devValues.reduce(function (a, b) { return a + b; }, 0) / devValues.length;
    var cityFiltered = cityValues.filter(function (v) { return v !== null; });
    var avgCity = cityFiltered.length > 0 ? cityFiltered.reduce(function (a, b) { return a + b; }, 0) / cityFiltered.length : null;

    var explanation = 'ממוצע רווחיות יזם: ' + avgDev.toFixed(1) + '%.';
    if (avgCity !== null) {
      explanation += ' ממוצע רווחיות עירייה: ' + avgCity.toFixed(1) + '%.';
      explanation += ' פער ממוצע: ' + (avgDev - avgCity).toFixed(1) + '%.';
    }
    explanation += '\nסה״כ ' + items.length + ' חוות דעת עם נתוני רווחיות יזם';
    if (cityFiltered.length > 0) {
      explanation += ', מתוכן ' + cityFiltered.length + ' עם נתוני רווחיות עירייה.';
    } else {
      explanation += '. אין עדיין נתוני רווחיות עירייה — הפער יחושב כשיוזנו.';
    }
    document.getElementById('explain-gap').textContent = explanation;
  }

  function renderDevAppraiserChart(data) {
    var byAppraiser = {};
    data.forEach(function (d) {
      if (!d.devAppraiser || d.devProfit === null) return;
      if (!byAppraiser[d.devAppraiser]) byAppraiser[d.devAppraiser] = [];
      byAppraiser[d.devAppraiser].push(d.devProfit);
    });

    var names = Object.keys(byAppraiser).sort();
    if (names.length === 0) {
      document.getElementById('explain-appraisers-dev').textContent = 'אין מספיק נתונים.';
      return;
    }

    var avgs = names.map(function (n) {
      var vals = byAppraiser[n];
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    });
    var counts = names.map(function (n) { return byAppraiser[n].length; });
    var maxAvg = Math.max.apply(null, avgs);
    var minAvg = Math.min.apply(null, avgs);

    var colors = avgs.map(function (v) {
      return profitColorByThreshold(v);
    });

    var ctx = document.getElementById('chart-appraisers-dev').getContext('2d');
    chartInstances.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: names.map(function (n, i) { return n + ' (' + counts[i] + ')'; }),
        datasets: [{
          label: 'ממוצע רווחיות יזם (%)',
          data: avgs,
          backgroundColor: colors,
          borderColor: colors.map(function (c) { return c.replace('0.8', '1'); }),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) { return 'ממוצע: ' + context.parsed.y.toFixed(1) + '%'; }
            }
          }
        },
        scales: {
          y: { title: { display: true, text: 'ממוצע רווחיות (%)' }, beginAtZero: true },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    }));

    var highest = names[avgs.indexOf(maxAvg)];
    var lowest = names[avgs.indexOf(minAvg)];
    document.getElementById('explain-appraisers-dev').textContent =
      'שמאי עם ממוצע הרווחיות הגבוה ביותר: ' + highest + ' (' + maxAvg.toFixed(1) + '%).' +
      ' שמאי עם ממוצע הרווחיות הנמוך ביותר: ' + lowest + ' (' + minAvg.toFixed(1) + '%).' +
      ' מספר השמאים: ' + names.length + '.';
  }

  function renderCityAppraiserChart(data) {
    var byAppraiser = {};
    data.forEach(function (d) {
      if (!d.cityAppraiser || d.cityProfit === null) return;
      if (!byAppraiser[d.cityAppraiser]) byAppraiser[d.cityAppraiser] = [];
      byAppraiser[d.cityAppraiser].push(d.cityProfit);
    });

    var names = Object.keys(byAppraiser).sort();
    if (names.length === 0) {
      document.getElementById('explain-appraisers-city').textContent =
        'אין עדיין נתוני רווחיות עירייה — הגרף יוצג כשיוזנו נתונים בעמודת "רווחיות עירייה (%)".';
      return;
    }

    var avgs = names.map(function (n) {
      var vals = byAppraiser[n];
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    });
    var counts = names.map(function (n) { return byAppraiser[n].length; });

    var ctx = document.getElementById('chart-appraisers-city').getContext('2d');
    chartInstances.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: names.map(function (n, i) { return n + ' (' + counts[i] + ')'; }),
        datasets: [{
          label: 'ממוצע רווחיות עירייה (%)',
          data: avgs,
          backgroundColor: avgs.map(function (v) { return profitColorByThreshold(v); }),
          borderColor: avgs.map(function (v) { return profitColorByThreshold(v); }),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: 'ממוצע רווחיות (%)' }, beginAtZero: true },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    }));

    document.getElementById('explain-appraisers-city').textContent =
      'סה״כ ' + names.length + ' שמאי עירייה עם נתוני רווחיות.';
  }

  function renderPairGapChart(data) {
    var byPair = {};
    data.forEach(function (d) {
      if (!d.devAppraiser || !d.cityAppraiser || d.gap === null) return;
      var key = d.devAppraiser + ' / ' + d.cityAppraiser;
      if (!byPair[key]) byPair[key] = [];
      byPair[key].push(d.gap);
    });

    var pairs = Object.keys(byPair).sort();
    if (pairs.length === 0) {
      document.getElementById('explain-ext-vs-city').textContent =
        'אין חוות דעת עם שני ערכי רווחיות (יזם + עירייה) להשוואה. הגרף יוצג כשיוזנו נתונים.';
      return;
    }

    var avgGaps = pairs.map(function (k) {
      var vals = byPair[k];
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    });

    var colors = avgGaps.map(function (g) {
      return g > 0 ? 'rgba(192,57,43,0.7)' : 'rgba(39,174,96,0.7)';
    });

    var ctx = document.getElementById('chart-ext-vs-city').getContext('2d');
    chartInstances.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: pairs,
        datasets: [{
          label: 'פער ממוצע (%)',
          data: avgGaps,
          backgroundColor: colors,
          borderColor: colors.map(function (c) { return c.replace('0.7', '1'); }),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                var v = context.parsed.y;
                return 'פער: ' + (v > 0 ? '+' : '') + v.toFixed(1) + '% ' +
                  (v > 0 ? '(לטובת היזם)' : '(לטובת העירייה)');
              }
            }
          }
        },
        scales: {
          y: { title: { display: true, text: 'פער ממוצע (%)' } },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    }));

    var proDevCount = avgGaps.filter(function (g) { return g > 0; }).length;
    var proCityCount = avgGaps.filter(function (g) { return g <= 0; }).length;
    document.getElementById('explain-ext-vs-city').textContent =
      'סה״כ ' + pairs.length + ' זוגות שמאים.' +
      ' ' + proDevCount + ' זוגות עם פער לטובת היזם (אדום).' +
      ' ' + proCityCount + ' זוגות עם פער לטובת העירייה (ירוק).';
  }

  // ── Wire Events ──

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

    document.getElementById('btn-analytics').addEventListener('click', showAnalytics);

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
        if (action === 'toggle-expand') toggleProjectExpand(id);
        else if (action === 'edit-project') startInlineProjectTableEdit(id);
        else if (action === 'delete-project') deleteProject(id);
        else if (action === 'save-project-table') saveInlineProjectTableEdit(id);
        else if (action === 'cancel-project-table') cancelInlineProjectTableEdit();
        else if (action === 'view-full-detail') showProjectDetail(id);
        else if (action === 'add-opinion-expanded') {
          showProjectDetail(btn.dataset.projectId);
          setTimeout(function () { showInlineNewOpinionRow(); }, 100);
        }
        else if (action === 'edit-opinion-expanded') {
          showProjectDetail(btn.dataset.projectId);
          setTimeout(function () { startInlineOpinionEdit(btn.dataset.id); }, 100);
        }
        else if (action === 'delete-opinion-expanded') {
          var projId = btn.dataset.projectId;
          deleteOpinion(projId, id).then(function () {
            if (expandedProjectId === projId) {
              var entry = findEntry(projId);
              if (entry) {
                var expRow = document.querySelector('tr[data-expanded-for="' + projId + '"] > td');
                if (expRow) renderExpandedOpinions(entry, expRow);
              }
            }
          });
        }
        return;
      }
      var row = e.target.closest('tr[data-id]');
      if (row && !row.classList.contains('expanded-detail-row') && !row.classList.contains('group-header-row')) {
        toggleProjectExpand(row.dataset.id);
      }
    });

    document.getElementById('btn-back').addEventListener('click', goBackToList);

    document.getElementById('btn-edit-project').addEventListener('click', function () {
      startInlineProjectEdit(currentProjectId);
    });

    document.getElementById('btn-add-opinion').addEventListener('click', function () {
      showInlineNewOpinionRow();
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
        startInlineOpinionEdit(opId);
      } else if (action === 'delete-opinion') {
        deleteOpinion(currentProjectId, opId);
      } else if (action === 'save-opinion') {
        saveInlineOpinionEdit(opId);
      } else if (action === 'cancel-opinion') {
        cancelInlineOpinionEdit();
      } else if (action === 'save-new-opinion') {
        saveInlineNewOpinion();
      } else if (action === 'cancel-new-opinion') {
        cancelInlineNewOpinion();
      }
    });

    document.getElementById('btn-analytics-back').addEventListener('click', goBackToList);

    document.getElementById('analytics-tabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.analytics-tab');
      if (tab && tab.dataset.tab) switchAnalyticsTab(tab.dataset.tab);
    });

    document.getElementById('group-by-select').addEventListener('change', function () {
      currentGroupBy = this.value || null;
      renderProjectsTable();
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

  function statusLabel(val) {
    if (!val) return '—';
    return val;
  }

  function statusColor(val) {
    var opt = STATUS_OPTIONS.find(function (o) { return o.value === val; });
    return opt ? opt.color : '';
  }

  function reverseStatusLabel(text) {
    if (!text) return '';
    var t = text.trim();
    if (t === 'ירוק') return 'בוצע';
    if (t === 'צהוב') return 'בטיפול';
    if (t === 'אדום') return 'הוגש';
    if (t === 'הוגש' || t === 'בטיפול' || t === 'בוצע') return t;
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
