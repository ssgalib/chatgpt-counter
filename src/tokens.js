(() => {
	'use strict';

	const GC = (globalThis.GPTCounter = globalThis.GPTCounter || {});

	// Hidden reasoning isn't fed back into later turns.
	const SKIP_CONTENT = new Set(['thoughts', 'reasoning_recap']);

	function countTokens(text) {
		if (!text) return 0;
		try {
			return globalThis.GPTTokenizer_o200k_base?.countTokens(text) ?? 0;
		} catch {
			return 0;
		}
	}

	// Walk from the active leaf to the root: only the visible branch is in context.
	function trunk(data) {
		const mapping = data?.mapping || {};
		const out = [];
		const seen = new Set();
		let id = data?.current_node;
		while (id && mapping[id] && !seen.has(id)) {
			seen.add(id);
			if (mapping[id].message) out.push(mapping[id].message);
			id = mapping[id].parent;
		}
		return out.reverse();
	}

	function messageText(message) {
		const c = message?.content;
		if (!c || SKIP_CONTENT.has(c.content_type)) return '';
		const parts = [];
		for (const p of Array.isArray(c.parts) ? c.parts : []) {
			if (typeof p === 'string') parts.push(p);
			else if (typeof p?.text === 'string') parts.push(p.text);
		}
		for (const key of ['text', 'user_profile', 'user_instructions']) {
			if (typeof c[key] === 'string') parts.push(c[key]);
		}
		return parts.join('\n');
	}

	// shortcut: keyed by id + text length, so an edit that keeps the exact length reuses a stale count; hash if that matters.
	const cache = new Map();

	function messageTokens(message, text) {
		const hit = cache.get(message.id);
		if (hit && hit.len === text.length) return hit.tokens;
		const tokens = countTokens(text);
		if (message.id) cache.set(message.id, { len: text.length, tokens });
		return tokens;
	}

	function computeMetrics(data) {
		const byRole = { user: 0, assistant: 0, tool: 0 };
		let messages = 0;
		let model = data?.default_model_slug || '';

		for (const message of trunk(data)) {
			const role = message.author?.role;
			if (!(role in byRole)) continue; // system prompt isn't visible to us
			const text = messageText(message);
			if (!text) continue;
			byRole[role] += messageTokens(message, text);
			if (role !== 'tool' && !message.metadata?.is_visually_hidden_from_conversation) messages++;
			if (role === 'assistant' && message.metadata?.model_slug) model = message.metadata.model_slug;
		}

		return { total: byRole.user + byRole.assistant + byRole.tool, byRole, messages, model };
	}

	GC.tokens = { countTokens, computeMetrics, trunk, messageText };
})();
