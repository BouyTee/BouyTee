import {
  CATEGORIES, validateExpense, filterExpenses, total, byCategory, monthlyTotals,
  formatCents, toCents, monthOf, toCSV, fromCSV,
} from './lib.js';

const STORAGE_KEY = 'expense-tracker:v1';
const $ = (sel) => document.querySelector(sel);

// ---- persistence -------------------------------------------------------
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.expenses)) return { budgets: {}, ...data };
  } catch { /* storage unavailable or corrupt */ }
  return { expenses: [], budgets: {} };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const state = load();
const filters = { month: monthOf(today()), category: '', query: '' };
let lastDeleted = null;

// ---- elements ----------------------------------------------------------
const form = $('#expense-form');
const fMonth = $('#filter-month');
const fCategory = $('#filter-category');
const fQuery = $('#filter-query');

function fillCategorySelects() {
  $('#category').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  fCategory.innerHTML = '<option value="">All categories</option>' +
    CATEGORIES.map((c) => `<option>${c}</option>`).join('');
}

const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function monthName(ym, short = false) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}

// ---- rendering ---------------------------------------------------------
function render() {
  const month = filters.month || monthOf(today());
  const monthExpenses = state.expenses.filter((e) => monthOf(e.date) === month);
  const spent = total(monthExpenses);

  $('#month-label').textContent = monthName(month);
  $('#month-total').textContent = formatCents(spent);

  const budget = state.budgets[month];
  const fill = $('#budget-fill');
  if (budget) {
    const pct = Math.min(100, (spent / budget) * 100);
    fill.style.width = pct + '%';
    fill.classList.toggle('over', spent > budget);
    fill.parentElement.hidden = false;
    $('#budget-text').textContent = spent > budget
      ? `${formatCents(spent - budget)} over ${formatCents(budget)} budget`
      : `${formatCents(budget - spent)} left of ${formatCents(budget)}`;
    $('#budget-btn').textContent = 'Edit budget';
  } else {
    fill.parentElement.hidden = true;
    $('#budget-text').textContent = 'No budget set for this month';
    $('#budget-btn').textContent = 'Set budget';
  }

  const cats = byCategory(monthExpenses);
  $('#cat-list').innerHTML = cats.length
    ? cats.map((c) => `
        <li>
          <div class="cat-row"><span class="dot" data-cat="${c.category}"></span>${c.category}
            <span class="cat-amt">${formatCents(c.amount)}</span></div>
          <div class="cat-bar"><div data-cat="${c.category}" style="width:${(c.share * 100).toFixed(1)}%"></div></div>
        </li>`).join('')
    : '<li class="muted">Nothing spent this month.</li>';

  const months = monthlyTotals(state.expenses, month, 6);
  const max = Math.max(1, ...months.map((m) => m.amount));
  $('#month-bars').innerHTML = months.map((m) => `
    <button type="button" class="bar-col${m.month === month ? ' active' : ''}" data-month="${m.month}"
      title="${monthName(m.month)}: ${formatCents(m.amount)}" aria-label="${monthName(m.month)}: ${formatCents(m.amount)}">
      <span class="bar" style="height:${Math.max(2, (m.amount / max) * 100)}%"></span>
      <span class="bar-label">${monthName(m.month, true)}</span>
    </button>`).join('');

  const list = filterExpenses(state.expenses, filters);
  $('#list-count').textContent = `${list.length} item${list.length === 1 ? '' : 's'} · ${formatCents(total(list))}`;
  $('#empty-state').hidden = list.length > 0;
  $('#expense-list').innerHTML = list.map((e) => `
    <li class="expense" data-id="${e.id}">
      <span class="dot" data-cat="${e.category}"></span>
      <div class="expense-main">
        <span class="expense-desc">${escapeHTML(e.description)}</span>
        <span class="muted small">${new Date(e.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${e.category}${e.note ? ' · ' + escapeHTML(e.note) : ''}</span>
      </div>
      <span class="expense-amt">${formatCents(e.amount)}</span>
      <div class="expense-actions">
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${escapeHTML(e.description)}">Edit</button>
        <button type="button" class="icon-btn danger" data-action="delete" aria-label="Delete ${escapeHTML(e.description)}">Delete</button>
      </div>
    </li>`).join('');
}

// ---- form --------------------------------------------------------------
function resetForm() {
  form.reset();
  form.id.value = '';
  form.date.value = today();
  form.category.value = 'Food';
  $('#form-title').textContent = 'Add expense';
  $('#submit-btn').textContent = 'Add expense';
  $('#cancel-edit').hidden = true;
  showErrors({});
}

function showErrors(errors) {
  form.querySelectorAll('[data-error]').forEach((p) => {
    const msg = errors[p.dataset.error] || '';
    p.textContent = msg;
    form.elements[p.dataset.error].setAttribute('aria-invalid', msg ? 'true' : 'false');
  });
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const raw = Object.fromEntries(new FormData(form));
  const { expense, errors } = validateExpense(raw);
  if (errors) {
    showErrors(errors);
    form.elements[Object.keys(errors)[0]].focus();
    return;
  }
  const i = state.expenses.findIndex((e) => e.id === expense.id);
  if (i >= 0) state.expenses[i] = expense;
  else state.expenses.push(expense);
  save();
  toast(i >= 0 ? 'Expense updated' : 'Expense added');
  if (monthOf(expense.date) !== filters.month && filters.month) setMonth(monthOf(expense.date));
  resetForm();
  render();
  form.amount.focus();
});

$('#cancel-edit').addEventListener('click', resetForm);

function startEdit(id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  form.id.value = e.id;
  form.amount.value = (e.amount / 100).toFixed(2);
  form.description.value = e.description;
  form.date.value = e.date;
  form.category.value = e.category;
  form.note.value = e.note || '';
  $('#form-title').textContent = 'Edit expense';
  $('#submit-btn').textContent = 'Save changes';
  $('#cancel-edit').hidden = false;
  showErrors({});
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.amount.focus();
}

$('#expense-list').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.expense').dataset.id;
  if (btn.dataset.action === 'edit') startEdit(id);
  else {
    const i = state.expenses.findIndex((e) => e.id === id);
    lastDeleted = state.expenses.splice(i, 1)[0];
    if (form.id.value === id) resetForm();
    save();
    render();
    toast('Expense deleted', 'Undo', () => {
      state.expenses.push(lastDeleted);
      lastDeleted = null;
      save();
      render();
    });
  }
});

// ---- filters & budget --------------------------------------------------
function setMonth(month) {
  filters.month = month;
  fMonth.value = month;
}
fMonth.addEventListener('change', () => { filters.month = fMonth.value; render(); });
fCategory.addEventListener('change', () => { filters.category = fCategory.value; render(); });
fQuery.addEventListener('input', () => { filters.query = fQuery.value; render(); });
$('#month-bars').addEventListener('click', (ev) => {
  const col = ev.target.closest('[data-month]');
  if (col) { setMonth(col.dataset.month); render(); }
});

$('#budget-btn').addEventListener('click', () => {
  const month = filters.month || monthOf(today());
  const current = state.budgets[month];
  const input = prompt(`Monthly budget for ${monthName(month)} (leave empty to remove):`,
    current ? (current / 100).toFixed(2) : '');
  if (input === null) return;
  if (input.trim() === '') delete state.budgets[month];
  else {
    const cents = toCents(input);
    if (cents === null) { toast('Budget must be a positive amount'); return; }
    state.budgets[month] = cents;
  }
  save();
  render();
});

// ---- import / export ---------------------------------------------------
$('#export-btn').addEventListener('click', () => {
  const list = filterExpenses(state.expenses, {});
  if (!list.length) { toast('Nothing to export yet'); return; }
  const blob = new Blob([toCSV(list)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `expenses-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import-input').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const { expenses, skipped } = fromCSV(await file.text());
  state.expenses.push(...expenses);
  save();
  render();
  toast(`Imported ${expenses.length} expense${expenses.length === 1 ? '' : 's'}` + (skipped ? `, skipped ${skipped} invalid row${skipped === 1 ? '' : 's'}` : ''));
});

// ---- toast -------------------------------------------------------------
let toastTimer;
function toast(message, actionLabel, action) {
  const el = $('#toast');
  el.innerHTML = '';
  el.append(message);
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link';
    b.textContent = actionLabel;
    b.onclick = () => { action(); el.classList.remove('show'); };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

// ---- init --------------------------------------------------------------
fillCategorySelects();
setMonth(filters.month);
resetForm();
render();
