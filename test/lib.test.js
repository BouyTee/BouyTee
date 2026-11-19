import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents, validateExpense, filterExpenses, total, byCategory, monthlyTotals, toCSV, fromCSV,
} from '../src/lib.js';

const sample = [
  { id: 'a', date: '2026-11-02', description: 'Groceries', category: 'Food', amount: 4250, note: '' },
  { id: 'b', date: '2026-11-10', description: 'Bus pass', category: 'Transport', amount: 6000, note: 'monthly' },
  { id: 'c', date: '2026-10-28', description: 'Dinner, "fancy"', category: 'Food', amount: 3000, note: 'with\nfriends' },
];

test('toCents parses amounts', () => {
  assert.equal(toCents('12.5'), 1250);
  assert.equal(toCents('$1,234.56'), 123456);
  assert.equal(toCents('7'), 700);
  assert.equal(toCents('0'), null);
  assert.equal(toCents('-3'), null);
  assert.equal(toCents('1.234'), null);
  assert.equal(toCents('abc'), null);
});

test('validateExpense reports errors and normalizes', () => {
  const bad = validateExpense({ amount: '', description: ' ', date: 'nope' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['amount', 'date', 'description']);
  const ok = validateExpense({ amount: '9.99', description: ' Coffee ', date: '2026-11-19', category: 'Bogus' });
  assert.equal(ok.expense.amount, 999);
  assert.equal(ok.expense.description, 'Coffee');
  assert.equal(ok.expense.category, 'Other');
  assert.ok(ok.expense.id);
});

test('filterExpenses by month, category, query; newest first', () => {
  assert.deepEqual(filterExpenses(sample).map((e) => e.id), ['b', 'a', 'c']);
  assert.deepEqual(filterExpenses(sample, { month: '2026-11' }).map((e) => e.id), ['b', 'a']);
  assert.deepEqual(filterExpenses(sample, { category: 'Food' }).map((e) => e.id), ['a', 'c']);
  assert.deepEqual(filterExpenses(sample, { query: 'MONTH' }).map((e) => e.id), ['b']);
});

test('totals and category breakdown', () => {
  assert.equal(total(sample), 13250);
  const cats = byCategory(sample);
  assert.equal(cats[0].category, 'Food');
  assert.equal(cats[0].amount, 7250);
  assert.ok(Math.abs(cats.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
});

test('monthlyTotals spans year boundaries', () => {
  const m = monthlyTotals(sample, '2027-01', 4);
  assert.deepEqual(m.map((x) => x.month), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.deepEqual(m.map((x) => x.amount), [3000, 10250, 0, 0]);
});

test('CSV round-trip preserves quotes, commas and newlines', () => {
  const { expenses, skipped } = fromCSV(toCSV(sample) + '\nbad-date,x,Food,1,');
  assert.equal(skipped, 1);
  assert.equal(expenses.length, 3);
  const dinner = expenses.find((e) => e.amount === 3000);
  assert.equal(dinner.description, 'Dinner, "fancy"');
  assert.equal(dinner.note, 'with\nfriends');
});
