const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('README includes the main project heading', () => {
  const content = readFileSync('README.md', 'utf8');
  assert.match(content, /^# تطبيق إدارة العقارات الذكي/m);
});
