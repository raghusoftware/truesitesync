import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPromptHtml, esc } = require('../electron/prompt.js');

test('escapes message and default value so page text cannot inject markup', () => {
  const html = buildPromptHtml(3, 'Deposit to <b>"HDFC"</b> & co', `it's <script>x</script>`);
  assert.ok(html.includes('Deposit to &lt;b&gt;&quot;HDFC&quot;&lt;/b&gt; &amp; co'));
  assert.ok(html.includes('value="it&#39;s &lt;script&gt;x&lt;/script&gt;"'));
  assert.ok(!html.includes('<b>"HDFC"</b>'));
});

test('embeds a numeric id only', () => {
  assert.ok(buildPromptHtml(7, 'x', '').includes('var id=7,'));
  assert.ok(buildPromptHtml('7);alert(1', 'x', '').includes('var id=0,'));
});

test('handles null and undefined message / default', () => {
  const html = buildPromptHtml(1, undefined, null);
  assert.ok(html.includes('<p class="msg"></p>'));
  assert.ok(html.includes('value=""'));
  assert.equal(esc(null), '');
});

test('keeps multi-line messages as text (pre-wrap), e.g. numbered task lists', () => {
  const html = buildPromptHtml(2, 'Assign Ravi to:\n1. Slab\n2. Plaster', '');
  assert.ok(html.includes('Assign Ravi to:\n1. Slab\n2. Plaster'));
  assert.ok(html.includes('white-space:pre-wrap'));
});
