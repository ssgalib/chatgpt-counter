// Runs in the page's MAIN world at document_start: observes ChatGPT's own fetches
// and relays data to the isolated content script via window.postMessage.
(() => {
	'use strict';

	const TAG = 'GPTCounter';
	const ORIGIN = location.origin;
	const CONVO_PATH = /^\/backend-api\/conversation\/([0-9a-f-]{36})$/;
	const COMPLETION_PATH = /^\/backend-api\/(f\/)?conversation$/;
	const originalFetch = window.fetch;

	let authHeaders = null; // copied from the page's own backend-api requests
	const last = { conversation: null, limits: null }; // replayed for the late-loading content script

	const post = (type, payload) => window.postMessage({ gc: TAG, type, payload }, ORIGIN);

	for (const name of ['pushState', 'replaceState']) {
		const orig = history[name];
		history[name] = function (...args) {
			const result = orig.apply(this, args);
			post('urlchange');
			return result;
		};
	}
	window.addEventListener('popstate', () => post('urlchange'));

	function captureAuth(input, init) {
		const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
		const auth = headers.get('authorization');
		if (!auth) return;
		authHeaders = { authorization: auth };
		for (const [k, v] of headers) {
			if (k.startsWith('oai-') || k === 'chatgpt-account-id') authHeaders[k] = v;
		}
	}

	function emitConversation(id, data) {
		last.conversation = { id, data };
		post('conversation', last.conversation);
	}

	async function readJson(response) {
		try {
			return await response.clone().json();
		} catch {
			return null;
		}
	}

	async function drainStream(response) {
		try {
			const reader = response.clone().body?.getReader();
			if (reader) while (!(await reader.read()).done);
		} catch {
			// aborted / network error: generation is over either way
		} finally {
			post('generation_end');
		}
	}

	window.fetch = async function (input, init) {
		let path = '';
		let method = 'GET';
		try {
			const url = new URL(input instanceof Request ? input.url : String(input), location.href);
			if (url.origin === ORIGIN) path = url.pathname;
			method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
			if (path.startsWith('/backend-api/')) captureAuth(input, init);
		} catch {
			// never break the page's fetch
		}

		const isCompletion = method === 'POST' && COMPLETION_PATH.test(path);
		if (isCompletion) post('generation_start');

		const response = await originalFetch.apply(this, arguments);

		try {
			if (isCompletion) {
				drainStream(response);
			} else if (method === 'GET' && CONVO_PATH.test(path) && response.ok) {
				const id = path.match(CONVO_PATH)[1];
				readJson(response).then((data) => data?.mapping && emitConversation(id, data));
			} else if (path === '/backend-api/conversation/init') {
				readJson(response).then((data) => {
					if (!Array.isArray(data?.limits_progress)) return;
					last.limits = data.limits_progress;
					post('limits', last.limits);
				});
			}
		} catch {
			// best effort
		}
		return response;
	};

	async function getAuth() {
		if (authHeaders) return authHeaders;
		const session = await originalFetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json());
		if (session?.accessToken) authHeaders = { authorization: `Bearer ${session.accessToken}` };
		return authHeaders || {};
	}

	async function fetchConversation(id) {
		const res = await originalFetch(`/backend-api/conversation/${id}`, {
			headers: await getAuth(),
			credentials: 'include'
		});
		if (res.status === 401) authHeaders = null; // token expired; next call re-reads the session
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		emitConversation(id, await res.json());
	}

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (event.source !== window || msg?.gc !== TAG || msg.type !== 'request') return;

		if (msg.kind === 'replay') {
			if (last.conversation) post('conversation', last.conversation);
			if (last.limits) post('limits', last.limits);
		} else if (msg.kind === 'conversation' && /^[0-9a-f-]{36}$/.test(msg.id)) {
			fetchConversation(msg.id).catch((e) => post('error', String(e?.message || e)));
		}
	});
})();
