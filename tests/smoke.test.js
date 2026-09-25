const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('README includes the main project heading', () => {
  const content = readFileSync('README.md', 'utf8');
  assert.match(content, /^# تطبيق إدارة العقارات الذكي/m);
});

test('README includes required section headings', () => {
  const content = readFileSync('README.md', 'utf8');
  const requiredSections = [
    '## نبذة عن التطبيق',
    '## الفئات المستفيدة',
    '## المتطلبات الأساسية',
    '## الاختبارات',
  ];

  for (const section of requiredSections) {
    assert.match(content, new RegExp(`^${section}$`, 'm'));
  }
});

test('README lists all target stakeholder groups', () => {
  const content = readFileSync('README.md', 'utf8');
  const groups = [
    '- إدارة الشركة',
    '- الموظفون',
    '- ملاك العقارات',
    '- المستأجرون',
    '- الفنيون',
  ];

  for (const group of groups) {
    assert.match(content, new RegExp(`^${group}$`, 'm'));
  }
});

test('package.json uses Node built-in test runner', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(packageJson.scripts.test, 'node --test');
});
