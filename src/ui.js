(() => {
	'use strict';

	const GC = (globalThis.GPTCounter = globalThis.GPTCounter || {});

	const PRESETS = [8000, 16000, 32000, 128000, 196000, 400000];
	const LIMIT_KEY = 'gc:contextLimit';
	const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
	const full = new Intl.NumberFormat();

	// ChatGPT's window depends on plan + model; this is a best guess the user can override.
	function autoLimit(model) {
		return /thinking|^o\d|reason/i.test(model || '') ? 196000 : 32000;
	}

	function readLimitPref() {
		try {
			const v = Number(localStorage.getItem(LIMIT_KEY));
			return PRESETS.includes(v) ? v : null;
		} catch {
			return null;
		}
	}

	function writeLimitPref(v) {
		try {
			if (v) localStorage.setItem(LIMIT_KEY, String(v));
			else localStorage.removeItem(LIMIT_KEY);
		} catch {
			// private mode etc.: setting just won't persist
		}
	}

	function formatIn(ms) {
		const mins = Math.max(0, Math.round(ms / 60000));
		if (mins < 60) return `${mins}m`;
		const h = Math.floor(mins / 60);
		if (h < 24) return `${h}h ${mins % 60}m`;
		return `${Math.floor(h / 24)}d ${h % 24}h`;
	}

	const prettyFeature = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

	// Static markup only; every dynamic value goes through textContent.
	const TEMPLATE = `
		<button type="button" class="gc-pill" aria-expanded="false" aria-haspopup="dialog">
			<svg class="gc-ring" viewBox="0 0 20 20" aria-hidden="true">
				<circle class="gc-ring__track" cx="10" cy="10" r="7.5" pathLength="100"/>
				<circle class="gc-ring__fill" cx="10" cy="10" r="7.5" pathLength="100" stroke-dasharray="0 100"/>
			</svg>
			<span class="gc-pill__count">0</span>
			<span class="gc-pill__limit"></span>
			<span class="gc-pill__draft" hidden></span>
			<span class="gc-spinner" hidden aria-hidden="true"></span>
		</button>
		<div class="gc-panel" role="dialog" aria-label="ChatGPT Counter" hidden>
			<div class="gc-panel__head">
				<span class="gc-title">Context window</span>
				<span class="gc-model"></span>
			</div>
			<div class="gc-big">
				<span class="gc-big__num">0</span>
				<span class="gc-big__unit">tokens</span>
				<span class="gc-big__pct"></span>
			</div>
			<div class="gc-stack" aria-hidden="true">
				<span class="gc-seg gc-seg--user"></span><span class="gc-seg gc-seg--assistant"></span><span class="gc-seg gc-seg--tool"></span>
			</div>
			<ul class="gc-legend">
				<li><i class="gc-dot gc-dot--user"></i>You<b data-role="user">0</b></li>
				<li><i class="gc-dot gc-dot--assistant"></i>ChatGPT<b data-role="assistant">0</b></li>
				<li><i class="gc-dot gc-dot--tool"></i>Tools<b data-role="tool">0</b></li>
			</ul>
			<div class="gc-stats">
				<div><span>Messages</span><b class="gc-stat-msgs">0</b></div>
				<div><span>Draft</span><b class="gc-stat-draft">0</b></div>
				<div><span>After send</span><b class="gc-stat-next">0</b></div>
			</div>
			<p class="gc-warn" hidden>Over the limit: ChatGPT is likely dropping the oldest messages.</p>
			<div class="gc-section">
				<span class="gc-label">Context limit</span>
				<div class="gc-seg-ctl" role="radiogroup" aria-label="Context limit"></div>
			</div>
			<div class="gc-section gc-limits" hidden>
				<span class="gc-label">Feature limits</span>
				<ul class="gc-limits__list"></ul>
			</div>
			<div class="gc-foot">
				<span class="gc-note">o200k tokenizer \u00B7 excludes system prompt, images &amp; files</span>
				<button type="button" class="gc-refresh">Refresh</button>
			</div>
		</div>`;

	class CounterUI {
		constructor({ onRefresh }) {
			this.onRefresh = onRefresh;
			this.metrics = null;
			this.draft = 0;
			this.limits = [];
			this.composer = null;
			this.resizeObserver = new ResizeObserver(() => this.schedulePosition());

			this.root = document.createElement('div');
			this.root.className = 'gc-root';
			this.root.innerHTML = TEMPLATE;
			const $ = (s) => this.root.querySelector(s);
			this.el = {
				pill: $('.gc-pill'),
				ringFill: $('.gc-ring__fill'),
				count: $('.gc-pill__count'),
				limit: $('.gc-pill__limit'),
				pillDraft: $('.gc-pill__draft'),
				spinner: $('.gc-spinner'),
				panel: $('.gc-panel'),
				model: $('.gc-model'),
				bigNum: $('.gc-big__num'),
				bigPct: $('.gc-big__pct'),
				segs: { user: $('.gc-seg--user'), assistant: $('.gc-seg--assistant'), tool: $('.gc-seg--tool') },
				legend: this.root.querySelectorAll('.gc-legend b'),
				msgs: $('.gc-stat-msgs'),
				statDraft: $('.gc-stat-draft'),
				next: $('.gc-stat-next'),
				warn: $('.gc-warn'),
				segCtl: $('.gc-seg-ctl'),
				limitsBox: $('.gc-limits'),
				limitsList: $('.gc-limits__list'),
				refresh: $('.gc-refresh')
			};

			this.el.pill.addEventListener('click', () => this.toggle());
			this.el.refresh.addEventListener('click', () => this.onRefresh());
			this.el.segCtl.addEventListener('click', (e) => {
				const btn = e.target.closest('button[data-limit]');
				if (!btn) return;
				writeLimitPref(Number(btn.dataset.limit) || null);
				this.render();
			});
			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && this.isOpen()) {
					this.toggle(false);
					this.el.pill.focus();
				}
			});
			document.addEventListener('pointerdown', (e) => {
				if (this.isOpen() && !this.root.contains(e.target)) this.toggle(false);
			});
			window.addEventListener('resize', () => this.schedulePosition());

			document.body.appendChild(this.root);
			this.render();
		}

		isOpen() {
			return !this.el.panel.hidden;
		}

		toggle(force = !this.isOpen()) {
			this.el.panel.hidden = !force;
			this.el.pill.setAttribute('aria-expanded', String(force));
		}

		contextLimit() {
			return readLimitPref() || autoLimit(this.metrics?.model);
		}

		// Called every second: re-finds the composer when React replaces it.
		trackComposer() {
			const form = document.querySelector('#prompt-textarea')?.closest('form') || null;
			if (form === this.composer) return;
			this.resizeObserver.disconnect();
			this.composer = form;
			if (form) {
				this.resizeObserver.observe(form);
				this.resizeObserver.observe(form.closest('main') || document.body); // sidebar toggles move the composer
			}
			this.schedulePosition();
		}

		schedulePosition() {
			if (this.positionQueued) return;
			this.positionQueued = true;
			requestAnimationFrame(() => {
				this.positionQueued = false;
				this.position();
			});
		}

		position() {
			const rect = this.composer?.getBoundingClientRect();
			const visible = !!rect && rect.width > 0;
			this.root.classList.toggle('gc-hidden', !visible);
			if (!visible) return;
			this.root.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
			this.root.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 6)}px`;
		}

		setMetrics(metrics) {
			this.metrics = metrics;
			this.render();
		}

		setDraft(tokens) {
			this.draft = tokens;
			this.render();
		}

		setGenerating(on) {
			this.el.spinner.hidden = !on;
			this.root.classList.toggle('gc-busy', on);
		}

		setLimits(limits) {
			this.limits = Array.isArray(limits) ? limits : [];
			this.renderLimits();
		}

		render() {
			const m = this.metrics;
			const total = m?.total || 0;
			const limit = this.contextLimit();
			const pct = Math.min(100, (total / limit) * 100);
			const level = pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : 'ok';

			this.root.dataset.level = level;
			this.el.ringFill.setAttribute('stroke-dasharray', `${pct.toFixed(1)} 100`);
			this.el.count.textContent = compact.format(total);
			this.el.limit.textContent = `/ ${compact.format(limit)}`;
			this.el.pillDraft.hidden = !this.draft;
			this.el.pillDraft.textContent = `+${compact.format(this.draft)}`;
			this.el.pill.setAttribute(
				'aria-label',
				`Context: ${full.format(total)} of ${full.format(limit)} tokens, ${Math.round(pct)}%` +
					(this.draft ? `. Draft ${full.format(this.draft)} tokens` : '')
			);

			this.el.model.textContent = m?.model || '';
			this.el.model.hidden = !m?.model;
			this.el.bigNum.textContent = full.format(total);
			this.el.bigPct.textContent = `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;

			for (const role of ['user', 'assistant', 'tool']) {
				const n = m?.byRole[role] || 0;
				this.el.segs[role].style.width = `${Math.min(100, (n / limit) * 100)}%`;
			}
			for (const b of this.el.legend) b.textContent = compact.format(m?.byRole[b.dataset.role] || 0);

			this.el.msgs.textContent = full.format(m?.messages || 0);
			this.el.statDraft.textContent = full.format(this.draft);
			this.el.next.textContent = `${Math.round(((total + this.draft) / limit) * 100)}%`;
			this.el.warn.hidden = total <= limit;

			this.renderSegControl(limit);
		}

		renderSegControl(limit) {
			const pref = readLimitPref();
			const options = [{ value: 0, label: `Auto \u00B7 ${compact.format(autoLimit(this.metrics?.model))}` }].concat(
				PRESETS.map((v) => ({ value: v, label: compact.format(v) }))
			);
			const key = `${pref}|${limit}`;
			if (this.segKey === key) return;
			this.segKey = key;
			this.el.segCtl.replaceChildren(
				...options.map(({ value, label }) => {
					const btn = document.createElement('button');
					btn.type = 'button';
					btn.dataset.limit = String(value);
					btn.textContent = label;
					btn.setAttribute('role', 'radio');
					btn.setAttribute('aria-checked', String((pref || 0) === value));
					return btn;
				})
			);
		}

		renderLimits() {
			const items = this.limits.filter((l) => l?.feature_name);
			this.el.limitsBox.hidden = !items.length;
			this.el.limitsList.replaceChildren(
				...items.map((l) => {
					const li = document.createElement('li');
					const name = document.createElement('span');
					name.textContent = prettyFeature(l.feature_name);
					const val = document.createElement('b');
					const reset = Date.parse(l.reset_after);
					val.textContent =
						(typeof l.remaining === 'number' ? `${l.remaining} left` : '—') +
						(Number.isFinite(reset) ? ` \u00B7 ${formatIn(reset - Date.now())}` : '');
					li.append(name, val);
					return li;
				})
			);
		}
	}

	GC.ui = { CounterUI };
})();
