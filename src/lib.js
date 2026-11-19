// Pure, DOM-free logic for the expense tracker. Tested in test/lib.test.js.

export const CATEGORIES = [
  'Food',
  'Transport',
  'Housing',
  'Utilities',
  'Shopping',
  'Health',
  'Entertainment',
  'Travel',
  'Other',
];

/** Parse an amount string into integer cents, or null if invalid. */
export function toCents(input) {
  const s = String(input ?? '').trim().replace(/[,\s$]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

export function formatCents(cents, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

/** Validate raw form data. Returns { expense } or { errors }. */
export function validateExpense(raw) {
  const errors = {};
  const amount = toCents(raw.amount);
  if (amount === null) errors.amount = 'Enter an amount greater than 0 (e.g. 12.50).';
  const description = String(raw.description ?? '').trim();
  if (!description) errors.description = 'Add a short description.';
  if (description.length > 120) errors.description = 'Keep it under 120 characters.';
  const date = String(raw.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    errors.date = 'Pick a valid date.';
  }
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'Other';
  if (Object.keys(errors).length) return { errors };
  return {
    expense: {
      id: raw.id || makeId(),
      amount,
      description,
      date,
      category,
      note: String(raw.note ?? '').trim().slice(0, 500),
    },
  };
}

export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** "2026-11" from "2026-11-19". */
export const monthOf = (date) => date.slice(0, 7);

export function filterExpenses(expenses, { month = '', category = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return expenses
    .filter((e) => !month || monthOf(e.date) === month)
    .filter((e) => !category || e.category === category)
    .filter(
      (e) => !q || e.description.toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q),
    )
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));
}

export const total = (expenses) => expenses.reduce((sum, e) => sum + e.amount, 0);

/** [{ category, amount, share }] sorted by amount desc. */
export function byCategory(expenses) {
  const sums = new Map();
  for (const e of expenses) sums.set(e.category, (sums.get(e.category) || 0) + e.amount);
  const all = total(expenses);
  return [...sums]
    .map(([category, amount]) => ({ category, amount, share: all ? amount / all : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Totals for the last `count` months ending at `endMonth` ("YYYY-MM"), oldest first. */
export function monthlyTotals(expenses, endMonth, count = 6) {
  const [y, m] = endMonth.split('-').map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months.map((month) => ({
    month,
    amount: total(expenses.filter((e) => monthOf(e.date) === month)),
  }));
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(expenses) {
  const rows = [['date', 'description', 'category', 'amount', 'note']];
  for (const e of expenses) {
    rows.push([e.date, e.description, e.category, (e.amount / 100).toFixed(2), e.note || '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Parse CSV produced by toCSV (header required). Returns { expenses, skipped }. */
export function fromCSV(text) {
  const rows = parseCSVRows(text);
  if (!rows.length) return { expenses: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const expenses = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const result = validateExpense({
      date: r[idx('date')],
      description: r[idx('description')],
      category: r[idx('category')],
      amount: r[idx('amount')],
      note: idx('note') >= 0 ? r[idx('note')] : '',
    });
    if (result.expense) expenses.push(result.expense);
    else skipped++;
  }
  return { expenses, skipped };
}
