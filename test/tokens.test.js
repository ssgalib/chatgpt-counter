// Run: node test/tokens.test.js
const assert = require('node:assert');
globalThis.GPTTokenizer_o200k_base = require('../src/vendor/o200k_base.js');
require('../src/tokens.js');
const { computeMetrics, countTokens } = globalThis.GPTCounter.tokens;

const msg = (id, role, content, metadata = {}) => ({ id, author: { role }, content, metadata });
const text = (s) => ({ content_type: 'text', parts: [s] });

const data = {
	current_node: 'a2',
	default_model_slug: 'gpt-5',
	mapping: {
		root: { parent: null, message: null },
		sys: { parent: 'root', message: msg('sys', 'system', text('You are ChatGPT')) },
		u1: { parent: 'sys', message: msg('u1', 'user', text('Hello there')) },
		a1: { parent: 'u1', message: msg('a1', 'assistant', text('Old branch reply')) },
		th: { parent: 'u1', message: msg('th', 'assistant', { content_type: 'thoughts', thoughts: [{ content: 'secret' }] }) },
		t1: { parent: 'th', message: msg('t1', 'tool', { content_type: 'execution_output', text: '42' }) },
		a2: { parent: 't1', message: msg('a2', 'assistant', text('The answer is 42'), { model_slug: 'gpt-5-thinking' }) }
	}
};

const m = computeMetrics(data);
assert.strictEqual(m.byRole.user, countTokens('Hello there'));
assert.strictEqual(m.byRole.assistant, countTokens('The answer is 42')); // old branch + thoughts excluded
assert.strictEqual(m.byRole.tool, countTokens('42'));
assert.strictEqual(m.total, m.byRole.user + m.byRole.assistant + m.byRole.tool);
assert.strictEqual(m.messages, 2);
assert.strictEqual(m.model, 'gpt-5-thinking');

// cycle in mapping must not hang
assert.strictEqual(computeMetrics({ current_node: 'x', mapping: { x: { parent: 'x', message: msg('x', 'user', text('hi')) } } }).messages, 1);
assert.deepStrictEqual(computeMetrics(null).total, 0);

console.log('ok', m);
