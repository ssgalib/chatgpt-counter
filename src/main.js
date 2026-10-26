(() => {
	'use strict';

	const GC = (globalThis.GPTCounter = globalThis.GPTCounter || {});
	if (GC.started) return;
	GC.started = true;

	const TAG = 'GPTCounter';
	const request = (kind, extra) => window.postMessage({ gc: TAG, type: 'request', kind, ...extra }, location.origin);
	const currentId = () => location.pathname.match(/\/c\/([0-9a-f-]{36})/)?.[1] || null;

	let convoId = null;
	let fetchTimer = null;
	let draftTimer = null;

	const ui = new GC.ui.CounterUI({ onRefresh: () => convoId && request('conversation', { id: convoId }) });

	function scheduleFetch(delay) {
		clearTimeout(fetchTimer);
		fetchTimer = setTimeout(() => {
			convoId = currentId();
			if (convoId) request('conversation', { id: convoId });
		}, delay);
	}

	function onUrlChange() {
		const id = currentId();
		if (id === convoId) return;
		convoId = id;
		ui.setMetrics(null);
		// The page usually fetches the conversation itself; only fetch if it hasn't shortly after.
		if (id) scheduleFetch(800);
	}

	const handlers = {
		urlchange: onUrlChange,
		conversation({ id, data }) {
			if (id !== currentId()) return;
			convoId = id;
			clearTimeout(fetchTimer);
			ui.setMetrics(GC.tokens.computeMetrics(data));
		},
		generation_start() {
			ui.setGenerating(true);
			ui.setDraft(0);
		},
		generation_end() {
			ui.setGenerating(false);
			scheduleFetch(400); // a new chat gets its /c/<id> URL during the stream
		},
		limits: (limits) => ui.setLimits(limits),
		error: () => ui.setGenerating(false)
	};

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (event.source !== window || msg?.gc !== TAG || msg.type === 'request') return;
		handlers[msg.type]?.(msg.payload);
	});

	// Live draft count, debounced so typing stays smooth on long prompts.
	document.addEventListener(
		'input',
		(e) => {
			const box = e.target.closest?.(GC.ui.COMPOSER);
			if (!box) return;
			clearTimeout(draftTimer);
			draftTimer = setTimeout(() => ui.setDraft(GC.tokens.countTokens(box.innerText || box.value || '')), 120);
		},
		true
	);

	setInterval(() => ui.trackComposer(), 1000);
	ui.trackComposer();
	onUrlChange();
	request('replay'); // pick up anything the bridge saw before we loaded
})();
