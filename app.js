/* ===========================================================
   個人財務系統 — 記帳器與試算器
   資料一律存在瀏覽器的 localStorage，不對外傳送。
   =========================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'pf.ledger.v1';

  var CATEGORIES = [
    '飲食', '居住', '交通', '通訊', '保險', '醫療',
    '日用', '教育成長', '娛樂', '旅遊', '人情', '稅費',
    '投資', '薪資', '獎金', '副業', '其他'
  ];

  var TYPE_LABEL = { income: '收入', expense: '支出', transfer: '轉帳' };
  var NATURE_LABEL = { fixed: '固定', variable: '變動' };
  var PURPOSE_LABEL = { need: '必要', want: '想要', invest: '投資' };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 儲存 ---------- */

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(entries) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      window.alert('無法寫入瀏覽器儲存空間，資料不會被保留。請改用匯出 CSV 備份。');
    }
  }

  var entries = load();

  /* ---------- 工具函式 ---------- */

  function money(n) {
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
  }

  function percent(n) {
    if (!isFinite(n)) { return '—'; }
    return (n * 100).toFixed(1) + '%';
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function isExpense(e) {
    return e.type === 'expense' && e.purpose !== 'invest';
  }

  function isInvestment(e) {
    return e.purpose === 'invest' && e.type !== 'income';
  }

  /* ---------- 初始化表單 ---------- */

  function initForm() {
    var sel = $('f-category');
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    $('f-date').value = todayISO();
    $('f-month').value = todayISO().slice(0, 7);
  }

  /* ---------- 儀表板 ---------- */

  function monthEntries() {
    var m = $('f-month').value;
    if (!m) { return entries; }
    return entries.filter(function (e) { return e.date.slice(0, 7) === m; });
  }

  function renderDashboard(rows) {
    var income = 0, expense = 0, fixedExp = 0, wantExp = 0, invested = 0;

    rows.forEach(function (e) {
      if (e.type === 'income') {
        income += e.amount;
      } else if (isExpense(e)) {
        expense += e.amount;
        if (e.nature === 'fixed') { fixedExp += e.amount; }
        if (e.purpose === 'want') { wantExp += e.amount; }
      }
      if (isInvestment(e)) { invested += e.amount; }
    });

    var net = income - expense;
    var rate = income > 0 ? net / income : NaN;
    var fixedRatio = income > 0 ? fixedExp / income : NaN;
    var wantRatio = expense > 0 ? wantExp / expense : NaN;

    $('kpi-income').textContent = money(income);
    $('kpi-expense').textContent = money(expense);

    var netEl = $('kpi-net');
    netEl.textContent = money(net);
    netEl.className = 'kpi ' + (net >= 0 ? 'good' : 'bad');

    setKpi('kpi-rate', rate, function (v) { return v >= 0.2; });
    setKpi('kpi-fixed', fixedRatio, function (v) { return v < 0.5; });
    setKpi('kpi-want', wantRatio, function (v) { return v < 0.3; });

    $('kpi-income').nextElementSibling.textContent =
      invested > 0 ? '本月投資投入 ' + money(invested) : '本月總流入';
  }

  function setKpi(id, value, isHealthy) {
    var el = $(id);
    if (!isFinite(value)) {
      el.textContent = '—';
      el.className = 'kpi';
      return;
    }
    el.textContent = percent(value);
    el.className = 'kpi ' + (isHealthy(value) ? 'good' : 'bad');
  }

  /* ---------- 分類佔比 ---------- */

  function renderBreakdown(rows) {
    var tbody = $('breakdown').querySelector('tbody');
    tbody.innerHTML = '';

    var buckets = {};
    var total = 0;

    rows.filter(isExpense).forEach(function (e) {
      if (!buckets[e.category]) { buckets[e.category] = { sum: 0, count: 0 }; }
      buckets[e.category].sum += e.amount;
      buckets[e.category].count += 1;
      total += e.amount;
    });

    var names = Object.keys(buckets).sort(function (a, b) {
      return buckets[b].sum - buckets[a].sum;
    });

    $('breakdown-empty').style.display = names.length ? 'none' : 'block';

    names.forEach(function (name) {
      var b = buckets[name];
      var share = total > 0 ? b.sum / total : 0;
      var tr = document.createElement('tr');

      appendCell(tr, name);
      appendCell(tr, money(b.sum));

      var barCell = document.createElement('td');
      var track = document.createElement('div');
      track.className = 'bar-track';
      var fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = (share * 100).toFixed(1) + '%';
      track.appendChild(fill);
      barCell.appendChild(track);
      var label = document.createElement('small');
      label.textContent = percent(share);
      barCell.appendChild(label);
      tr.appendChild(barCell);

      appendCell(tr, String(b.count));
      tbody.appendChild(tr);
    });
  }

  function appendCell(tr, text, className) {
    var td = document.createElement('td');
    td.textContent = text;
    if (className) { td.className = className; }
    tr.appendChild(td);
    return td;
  }

  /* ---------- 明細 ---------- */

  function renderEntries(rows) {
    var tbody = $('entries').querySelector('tbody');
    tbody.innerHTML = '';

    rows.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : b.id - a.id);
    }).forEach(function (e) {
      var tr = document.createElement('tr');
      appendCell(tr, e.date);
      appendCell(tr, TYPE_LABEL[e.type] || e.type);
      appendCell(tr, e.category);
      appendCell(tr, e.account || '—');
      appendCell(tr, (NATURE_LABEL[e.nature] || '') + '／' + (PURPOSE_LABEL[e.purpose] || ''));
      appendCell(tr,
        (e.type === 'income' ? '+' : e.type === 'expense' ? '-' : '→') + money(e.amount),
        e.type === 'income' ? 'amount-in' : e.type === 'expense' ? 'amount-out' : '');
      appendCell(tr, e.note || '');

      var actionCell = document.createElement('td');
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'link-btn';
      del.textContent = '刪除';
      del.addEventListener('click', function () { removeEntry(e.id); });
      actionCell.appendChild(del);
      tr.appendChild(actionCell);

      tbody.appendChild(tr);
    });
  }

  function removeEntry(id) {
    entries = entries.filter(function (e) { return e.id !== id; });
    save(entries);
    render();
  }

  function render() {
    var rows = monthEntries();
    renderDashboard(rows);
    renderBreakdown(rows);
    renderEntries(rows);
  }

  /* ---------- 新增 ---------- */

  function handleSubmit(ev) {
    ev.preventDefault();
    var amount = parseFloat($('f-amount').value);
    if (!isFinite(amount) || amount <= 0) {
      window.alert('請輸入大於 0 的金額。');
      return;
    }

    entries.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: $('f-date').value || todayISO(),
      type: $('f-type').value,
      account: $('f-account').value,
      amount: amount,
      category: $('f-category').value,
      nature: $('f-nature').value,
      purpose: $('f-purpose').value,
      note: $('f-note').value.trim()
    });

    save(entries);
    $('f-amount').value = '';
    $('f-note').value = '';
    $('f-amount').focus();
    render();
  }

  /* ---------- CSV ---------- */

  var CSV_HEADER = ['date', 'type', 'account', 'amount', 'category', 'nature', 'purpose', 'note'];

  function csvEscape(value) {
    var s = String(value === undefined || value === null ? '' : value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    if (!entries.length) {
      window.alert('目前沒有資料可以匯出。');
      return;
    }
    var lines = [CSV_HEADER.join(',')];
    entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .forEach(function (e) {
        lines.push(CSV_HEADER.map(function (k) { return csvEscape(e[k]); }).join(','));
      });

    // BOM 讓 Excel 正確辨識 UTF-8
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ledger-' + todayISO() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function importCSV(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result).replace(/^﻿/, '');
      var rows = parseCSV(text).filter(function (r) { return r.length > 1; });
      if (!rows.length) { window.alert('讀不到任何資料列。'); return; }

      var header = rows[0].map(function (h) { return h.trim(); });
      var added = 0;

      rows.slice(1).forEach(function (r) {
        var obj = {};
        header.forEach(function (key, idx) { obj[key] = (r[idx] || '').trim(); });

        var amount = parseFloat(obj.amount);
        if (!obj.date || !isFinite(amount) || amount <= 0) { return; }

        entries.push({
          id: Date.now() + Math.floor(Math.random() * 100000) + added,
          date: obj.date,
          type: TYPE_LABEL[obj.type] ? obj.type : 'expense',
          account: obj.account || '',
          amount: amount,
          category: obj.category || '其他',
          nature: obj.nature === 'fixed' ? 'fixed' : 'variable',
          purpose: PURPOSE_LABEL[obj.purpose] ? obj.purpose : 'need',
          note: obj.note || ''
        });
        added++;
      });

      save(entries);
      render();
      window.alert('已匯入 ' + added + ' 筆資料。');
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ---------- 範例資料 ---------- */

  function loadSample() {
    if (entries.length && !window.confirm('這會在現有資料之外再加入一組範例，確定嗎？')) { return; }

    var m = ($('f-month').value || todayISO().slice(0, 7));
    var sample = [
      ['05', 'income', '薪轉戶', 62000, '薪資', 'fixed', 'need', '本月薪資'],
      ['05', 'transfer', '證券戶', 12000, '投資', 'fixed', 'invest', '定期定額（發薪日隔天自動轉）'],
      ['05', 'expense', '薪轉戶', 18000, '居住', 'fixed', 'need', '房租'],
      ['05', 'expense', '數位帳戶', 1200, '通訊', 'fixed', 'need', '電信月租'],
      ['06', 'expense', '信用卡', 2400, '保險', 'fixed', 'need', '實支實付醫療險'],
      ['07', 'expense', '信用卡', 480, '娛樂', 'fixed', 'want', '串流訂閱 ×3（止血區）'],
      ['08', 'expense', '現金', 3200, '飲食', 'variable', 'need', '一週伙食'],
      ['12', 'expense', '信用卡', 1580, '教育成長', 'variable', 'need', '技術書'],
      ['15', 'expense', '數位帳戶', 2600, '交通', 'fixed', 'need', '通勤月票'],
      ['18', 'expense', '信用卡', 4200, '旅遊', 'variable', 'want', '週末小旅行（快樂桶）'],
      ['22', 'expense', '現金', 2900, '飲食', 'variable', 'need', '一週伙食'],
      ['25', 'income', '數位帳戶', 8000, '副業', 'variable', 'need', '接案尾款'],
      ['26', 'expense', '信用卡', 1800, '日用', 'variable', 'need', '生活用品補貨'],
      ['28', 'expense', '信用卡', 3500, '娛樂', 'variable', 'want', '演唱會票']
    ];

    sample.forEach(function (s, i) {
      entries.push({
        id: Date.now() + i,
        date: m + '-' + s[0],
        type: s[1],
        account: s[2],
        amount: s[3],
        category: s[4],
        nature: s[5],
        purpose: s[6],
        note: s[7]
      });
    });

    save(entries);
    render();
  }

  function clearAll() {
    if (!window.confirm('確定清空所有記帳資料？此動作無法復原，建議先匯出 CSV。')) { return; }
    entries = [];
    save(entries);
    render();
  }

  /* ---------- 試算器 ---------- */

  function num(id) {
    var v = parseFloat($(id).value);
    return isFinite(v) ? v : 0;
  }

  function futureValue(initial, monthly, annualRate, months) {
    var i = annualRate / 12;
    if (i === 0) { return initial + monthly * months; }
    var growth = Math.pow(1 + i, months);
    return initial * growth + monthly * (growth - 1) / i;
  }

  function calculate() {
    var monthly = num('c-monthly');
    var initial = num('c-initial');
    var rate = num('c-return') / 100;
    var years = Math.max(1, num('c-years'));
    var expense = num('c-expense');
    var swr = num('c-swr') / 100;

    var months = Math.round(years * 12);
    var final = futureValue(initial, monthly, rate, months);
    var contributed = initial + monthly * months;

    $('r-final').textContent = money(final);
    $('r-breakdown').textContent =
      '本金 ' + money(contributed) + '＋複利 ' + money(final - contributed);

    var target = swr > 0 ? (expense * 12) / swr : NaN;
    $('r-target').textContent = isFinite(target) ? money(target) : '—';

    // 逐月推進，找出達標所需年數
    var yearsNeeded = null;
    if (isFinite(target) && target > 0) {
      if (initial >= target) {
        yearsNeeded = 0;
      } else if (monthly > 0 || rate > 0) {
        for (var m = 1; m <= 12 * 80; m++) {
          if (futureValue(initial, monthly, rate, m) >= target) {
            yearsNeeded = m / 12;
            break;
          }
        }
      }
    }

    var yearsEl = $('r-years');
    if (yearsNeeded === null) {
      yearsEl.textContent = '不會達標';
      yearsEl.className = 'kpi bad';
      $('r-years-note').textContent = '以目前的投入與報酬率推估，80 年內無法達標。';
    } else {
      yearsEl.textContent = yearsNeeded.toFixed(1) + ' 年';
      yearsEl.className = 'kpi ' + (yearsNeeded <= years ? 'good' : 'bad');
      $('r-years-note').textContent = yearsNeeded <= years
        ? '在設定的 ' + years + ' 年內達標。'
        : '比設定的 ' + years + ' 年多 ' + (yearsNeeded - years).toFixed(1) + ' 年。';
    }

    $('r-passive').textContent = money(final * swr / 12);
  }

  /* ---------- 綁定 ---------- */

  function init() {
    initForm();

    $('entry-form').addEventListener('submit', handleSubmit);
    $('f-month').addEventListener('change', render);
    $('btn-sample').addEventListener('click', loadSample);
    $('btn-export').addEventListener('click', exportCSV);
    $('btn-clear').addEventListener('click', clearAll);
    $('file-import').addEventListener('change', function (ev) {
      if (ev.target.files && ev.target.files[0]) { importCSV(ev.target.files[0]); }
      ev.target.value = '';
    });

    ['c-monthly', 'c-initial', 'c-return', 'c-years', 'c-expense', 'c-swr']
      .forEach(function (id) { $(id).addEventListener('input', calculate); });

    render();
    calculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
