/* Paint PDP Configurator
 * ─────────────────────────────────────────────────────────────────
 * Renders 3 step-pickers (surface, finish, size) and a decision card
 * with two CTAs (sample + add-to-cart).
 *
 * Cross-product moves (changing surface or finish) are handled via a
 * hard navigation to the matching product handle, preserving ?color=.
 * Only size changes resolve a variant on the current product.
 */
(function () {
  var root = document.querySelector('[data-pdp-cfg]');
  if (!root) return;

  var form     = root.querySelector('[data-pdp-cfg-form]');
  var configEl = root.querySelector('[data-pdp-cfg-config]');
  if (!form || !configEl) return;

  var data;
  try { data = JSON.parse(configEl.textContent); }
  catch (e) {
    console.error('Paint PDP cfg: bad JSON config', e);
    return;
  }

  // Reveal the enhanced UI; the <noscript> fallback was already printed.
  form.hidden = false;

  // ─── Resolve current state from the rendered product ─────────────
  var currentHandle  = data.currentHandle;
  var sizes          = data.sizes || [];
  var surfacesConfig = data.config || {};
  var optionNames    = data.optionNames || [];
  var variants       = data.currentVariants || [];

  // Map option name → index, so we don't depend on a fixed order.
  var farveIdx = optionNames.indexOf('Farve');
  var sizeIdx  = optionNames.indexOf('Størrelse');

  // Walk the surface map to figure out which surface + finish the
  // current product belongs to (for default selection state).
  var initialSurface = null;
  var initialFinish  = null;
  Object.keys(surfacesConfig).forEach(function (surfaceName) {
    var finishes = (surfacesConfig[surfaceName] || {}).finishes || [];
    finishes.forEach(function (f) {
      if (f.handle === currentHandle) {
        initialSurface = surfaceName;
        initialFinish  = f.handle;
      }
    });
  });

  // Fall back to first surface if the current product isn't in the map.
  // (Misconfiguration; the merchant needs to add this handle to the JSON.)
  if (!initialSurface) {
    initialSurface = Object.keys(surfacesConfig)[0] || null;
    if (initialSurface) {
      var firstFin = (surfacesConfig[initialSurface].finishes || [])[0];
      initialFinish = firstFin ? firstFin.handle : null;
    }
    console.warn('Paint PDP cfg: current handle "' + currentHandle +
                 '" is not in the surface→finish map; defaults may be wrong.');
  }

  // Pick the popular-flagged size, otherwise the middle, otherwise first.
  function pickDefaultSize() {
    var pop = sizes.find(function (s) { return s.popular; });
    if (pop) return pop.option;
    if (sizes.length === 0) return null;
    return sizes[Math.floor(sizes.length / 2)].option;
  }

  var state = {
    surface: initialSurface,
    finish:  initialFinish,
    size:    pickDefaultSize(),
  };

  // ─── Render helpers ──────────────────────────────────────────────
  var surfaceList = Object.keys(surfacesConfig);

  function chip(label, value, checked, opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'paint-pdp-cfg__chip';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    btn.tabIndex = checked ? 0 : -1;
    btn.dataset.value = value;
    btn.innerHTML =
      '<span>' + escapeHtml(label) + '</span>' +
      (opts.meta ? '<span class="paint-pdp-cfg__chip-meta">' + escapeHtml(opts.meta) + '</span>' : '') +
      (opts.badge ? '<span class="paint-pdp-cfg__chip-badge">' + escapeHtml(opts.badge) + '</span>' : '');
    return btn;
  }

  function card(finish, checked) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'paint-pdp-cfg__card';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    btn.tabIndex = checked ? 0 : -1;
    btn.dataset.value = finish.handle;
    var badge = finish.popular ? '<span class="paint-pdp-cfg__chip-badge">Populær</span>'
              : finish.auto    ? '<span class="paint-pdp-cfg__chip-badge">Auto-valgt</span>'
              : '';
    btn.innerHTML =
      '<span class="paint-pdp-cfg__card-title">' +
        '<span>' + escapeHtml(finish.label) + '</span>' + badge +
      '</span>' +
      (finish.sublabel ? '<span class="paint-pdp-cfg__card-sub">' + escapeHtml(finish.sublabel) + '</span>' : '');
    return btn;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ─── Renderers ───────────────────────────────────────────────────
  function renderSurface() {
    var container = form.querySelector('[data-chips="surface"]');
    container.innerHTML = '';
    surfaceList.forEach(function (name) {
      container.appendChild(chip(name, name, name === state.surface));
    });
  }

  function renderFinish() {
    var container = form.querySelector('[data-chips="finish"]');
    container.innerHTML = '';
    var entry = surfacesConfig[state.surface] || { finishes: [] };
    entry.finishes.forEach(function (f) {
      container.appendChild(card(f, f.handle === state.finish));
    });
  }

  function renderSize() {
    var container = form.querySelector('[data-chips="size"]');
    container.innerHTML = '';
    sizes.forEach(function (s) {
      var badge = s.popular ? 'Populær' : null;
      container.appendChild(chip(s.label, s.option, s.option === state.size, {
        meta:  s.coverage,
        badge: badge,
      }));
    });
  }

  function renderSummary() {
    setSummary('surface', state.surface || '—');
    var finishLabel = '—';
    var entry = surfacesConfig[state.surface] || { finishes: [] };
    var finish = entry.finishes.find(function (f) { return f.handle === state.finish; });
    if (finish) finishLabel = finish.label + (finish.sublabel ? ' · ' + finish.sublabel : '');
    setSummary('finish', finishLabel);

    var size = sizes.find(function (s) { return s.option === state.size; });
    setSummary('size', size ? size.label : '—');
  }

  function setSummary(key, value) {
    var el = form.querySelector('[data-summary="' + key + '"]');
    if (el) el.textContent = value;
  }

  function renderPrice() {
    var priceEl = form.querySelector('[data-price]');
    var addBtn  = form.querySelector('[data-action="add-to-cart"]');
    var variant = currentVariant();
    if (variant) {
      priceEl.textContent = variant.priceFormatted;
      addBtn.disabled = !variant.available;
      hideError();
    } else {
      priceEl.textContent = '—';
      addBtn.disabled = true;
      // Don't show an error for a "wrong product" state; the redirect
      // will handle that as soon as the user picks finish/surface.
    }
  }

  function currentVariant() {
    if (sizeIdx < 0) return null;
    var color = form.dataset.color;
    return variants.find(function (v) {
      var sizeMatches = v.options[sizeIdx] === state.size;
      // Color match is best-effort: if URL color is empty or unknown,
      // accept the first available size match (so price still shows).
      var colorMatches = farveIdx < 0 || !color || v.options[farveIdx] === color;
      return sizeMatches && colorMatches;
    }) || variants.find(function (v) {
      // Fallback: any variant with the right size (color may be missing).
      return sizeIdx >= 0 && v.options[sizeIdx] === state.size;
    });
  }

  // ─── Selection handlers ──────────────────────────────────────────
  function selectSurface(name) {
    if (name === state.surface) return;
    state.surface = name;
    var entry = surfacesConfig[name] || { finishes: [] };
    var firstFinish = entry.finishes[0];
    var nextHandle = entry.defaultHandle ||
                     (firstFinish ? firstFinish.handle : null);
    if (nextHandle) navigateTo(nextHandle);
  }

  function selectFinish(handle) {
    if (handle === state.finish) return;
    navigateTo(handle);
  }

  function selectSize(option) {
    state.size = option;
    renderSize();
    renderSummary();
    renderPrice();
  }

  function navigateTo(handle) {
    if (!handle || handle === currentHandle) return;
    var color = form.dataset.color;
    var url = '/products/' + handle + (color ? '?color=' + encodeURIComponent(color) : '');
    window.location.href = url;
  }

  // ─── Event delegation + keyboard arrow nav ───────────────────────
  form.addEventListener('click', function (e) {
    var target = e.target.closest('[role="radio"]');
    if (!target) return;
    var group = target.closest('[role="radiogroup"]');
    if (!group) return;
    handleSelect(group, target);
  });

  form.addEventListener('keydown', function (e) {
    var target = e.target.closest('[role="radio"]');
    if (!target) return;
    var group = target.closest('[role="radiogroup"]');
    if (!group) return;
    var radios = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
    var idx = radios.indexOf(target);
    var next = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = radios[(idx + 1) % radios.length]; break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = radios[(idx - 1 + radios.length) % radios.length]; break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        handleSelect(group, target);
        return;
    }
    if (next) {
      e.preventDefault();
      next.focus();
      handleSelect(group, next);
    }
  });

  function handleSelect(group, target) {
    var kind = group.dataset.chips;
    // Update aria-checked + tabindex within this group.
    group.querySelectorAll('[role="radio"]').forEach(function (r) {
      var isMe = r === target;
      r.setAttribute('aria-checked', isMe ? 'true' : 'false');
      r.tabIndex = isMe ? 0 : -1;
    });
    if (kind === 'surface') selectSurface(target.dataset.value);
    else if (kind === 'finish') selectFinish(target.dataset.value);
    else if (kind === 'size') selectSize(target.dataset.value);
  }

  // ─── CTAs ────────────────────────────────────────────────────────
  form.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'add-to-cart') addCurrentVariantToCart(btn);
    else if (action === 'add-sample') addSampleToCart(btn);
  });

  function addCurrentVariantToCart(btn) {
    var variant = currentVariant();
    if (!variant) {
      showError('Vi kunne ikke finde den valgte variant. Prøv en anden størrelse.');
      return;
    }
    btn.disabled = true;
    var color = form.dataset.color;
    postCartAdd({
      id: variant.id,
      quantity: 1,
      properties: lineItemProps(),
    }).then(function () {
      window.location.href = '/cart';
    }).catch(function (err) {
      btn.disabled = false;
      showError(err && err.message || 'Noget gik galt — prøv igen.');
    });
  }

  function addSampleToCart(btn) {
    var sampleId = form.dataset.sampleVariantId;
    if (!sampleId) {
      showError('Prøvebøtten er endnu ikke konfigureret.');
      return;
    }
    btn.disabled = true;
    postCartAdd({
      id: parseInt(sampleId, 10),
      quantity: 1,
      properties: Object.assign({ Reference: currentHandle }, lineItemProps()),
    }).then(function () {
      window.location.href = '/cart';
    }).catch(function (err) {
      btn.disabled = false;
      showError(err && err.message || 'Noget gik galt — prøv igen.');
    });
  }

  function lineItemProps() {
    var color = form.dataset.color;
    var props = {};
    if (color) props['Farve'] = color;
    // Color code (DLM####) isn't on the URL today — once the swatch
    // pages forward it (e.g. ?color=Mynte&code=DLM0402) read it here.
    return props;
  }

  function postCartAdd(payload) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) {
          throw new Error(j.description || j.message || 'Cart add failed');
        });
      }
      return res.json();
    });
  }

  function showError(msg) {
    var el = form.querySelector('[data-error]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function hideError() {
    var el = form.querySelector('[data-error]');
    if (el) el.hidden = true;
  }

  // ─── Boot ────────────────────────────────────────────────────────
  renderSurface();
  renderFinish();
  renderSize();
  renderSummary();
  renderPrice();
})();
