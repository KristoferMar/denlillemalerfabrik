(function () {
  // ─── DOM ───────────────────────────────────────────────────────────
  var grid          = document.getElementById('vores-farver-grid');
  if (!grid) return;

  // ─── Family filter pills ───────────────────────────────────────────
  // Pills above the grid filter the visible swatches by color family.
  // "Alle" restores the original 8-column-by-family layout; selecting a
  // single family hides non-matching swatches (and the layout-padding
  // empty placeholders) so the visible colors of that family fill the
  // grid in light→dark order.
  var filterButtons = document.querySelectorAll('.vores-farver__filter');
  if (filterButtons.length) {
    filterButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var family = btn.getAttribute('data-family-filter');
        filterButtons.forEach(function (b) { b.classList.remove('vores-farver__filter--active'); });
        btn.classList.add('vores-farver__filter--active');
        applyFamilyFilter(family);
      });
    });
  }

  function applyFamilyFilter(family) {
    var isAll = family === 'all';
    grid.classList.toggle('vores-farver__grid--filtered', !isAll);
    var swatches = grid.querySelectorAll('.vores-farver__swatch');

    // First pass: clear previous animation state and toggle visibility.
    var visibleIndex = 0;
    swatches.forEach(function (sw) {
      var swFam = sw.getAttribute('data-family');
      var isEmpty = sw.getAttribute('data-empty') === 'true';
      var visible = isAll
        ? true
        : (!isEmpty && swFam === family);

      sw.classList.remove('vores-farver__swatch--fade-in');
      sw.style.animationDelay = '';
      sw.classList.toggle('vores-farver__swatch--hidden', !visible);

      if (visible && !isEmpty) {
        // Cap the stagger total so families with many items don't drag on.
        sw.style.animationDelay = Math.min(visibleIndex * 25, 400) + 'ms';
        visibleIndex++;
      }
    });

    // Force reflow so the next add() restarts the animation reliably,
    // even if the same pill is clicked twice in a row.
    void grid.offsetWidth;

    swatches.forEach(function (sw) {
      var isEmpty = sw.getAttribute('data-empty') === 'true';
      if (!isEmpty && !sw.classList.contains('vores-farver__swatch--hidden')) {
        sw.classList.add('vores-farver__swatch--fade-in');
      }
    });
  }
  var hoverPreview  = document.getElementById('vf-hover-preview');
  var hoverScene    = document.getElementById('vf-hover-preview-scene');
  var hoverName     = document.getElementById('vf-hover-name');
  var hoverCode     = document.getElementById('vf-hover-code');
  var inspiration   = document.getElementById('vores-farver-inspiration');
  var photoMount    = document.getElementById('vf-photo-mount');
  var cfgMount      = document.getElementById('vf-cfg-mount');
  var colorNameEl   = document.getElementById('vf-color-name');
  var swatchChip    = document.getElementById('vf-swatch-chip');
  var swatchName    = document.getElementById('vf-swatch-name');
  var swatchCode    = document.getElementById('vf-swatch-code');

  // ─── Variant map (built from Liquid) ───────────────────────────────
  // Keyed by "handle||color||size" so the configurator resolves an
  // exact variant (with live price + availability) for each combo.
  var variantsByKey = new Map();
  var mapEl = document.getElementById('product-finder-variant-map');
  if (mapEl) {
    try {
      var parsed = JSON.parse(mapEl.textContent);
      (parsed.variants || []).forEach(function (v) {
        variantsByKey.set(v.handle + '||' + v.color + '||' + v.size, v);
      });
    } catch (e) {
      console.error('Vores farver: failed to parse variant map', e);
    }
  }

  // ─── 6 SVG room scenes ─────────────────────────────────────────────
  // The wall takes the colour via inline fill. Everything else is fixed
  // furniture/styling so it reads like a small staged room.
  function roomSVG(variant, wallColor) {
    var scenes = {
      0: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
           '<rect x="0" y="0" width="400" height="240" fill="' + wallColor + '"/>' +
           '<rect x="0" y="240" width="400" height="60" fill="#b89f7c"/>' +
           '<rect x="0" y="237" width="400" height="4" fill="#a0885f"/>' +
           '<rect x="160" y="55" width="120" height="90" fill="#f6f0e4" stroke="#2a241c" stroke-width="3"/>' +
           '<path d="M175 135 L200 95 L230 120 L265 80 L265 140 L175 140 Z" fill="#a0884f" opacity="0.55"/>' +
           '<circle cx="205" cy="85" r="6" fill="#e6c27a"/>' +
           '<rect x="70" y="185" width="260" height="55" rx="6" fill="#2b2520"/>' +
           '<rect x="70" y="175" width="260" height="22" rx="6" fill="#34291f"/>' +
           '<rect x="80" y="197" width="75" height="40" rx="8" fill="#40342a"/>' +
           '<rect x="245" y="197" width="75" height="40" rx="8" fill="#40342a"/>' +
           '<line x1="40" y1="240" x2="40" y2="140" stroke="#2a241c" stroke-width="3"/>' +
           '<path d="M25 140 L55 140 L52 118 L28 118 Z" fill="#d4a76a"/>' +
         '</svg>',
      1: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
           '<rect x="0" y="0" width="400" height="240" fill="' + wallColor + '"/>' +
           '<rect x="0" y="240" width="400" height="60" fill="#b89f7c"/>' +
           '<rect x="0" y="237" width="400" height="4" fill="#a0885f"/>' +
           '<rect x="110" y="120" width="180" height="120" rx="8" fill="#3d2f24"/>' +
           '<rect x="70" y="200" width="260" height="40" fill="#e8dcc6"/>' +
           '<rect x="85" y="180" width="75" height="35" rx="8" fill="#f3e9d4"/>' +
           '<rect x="180" y="180" width="75" height="35" rx="8" fill="#f3e9d4"/>' +
           '<rect x="20" y="210" width="45" height="30" fill="#2a241c"/>' +
           '<rect x="33" y="190" width="20" height="20" fill="#2a241c"/>' +
           '<path d="M25 190 L60 190 L55 170 L30 170 Z" fill="#d4a76a"/>' +
           '<rect x="335" y="210" width="45" height="30" fill="#2a241c"/>' +
           '<circle cx="357" cy="198" r="8" fill="#a0c48b"/>' +
         '</svg>',
      2: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
           '<rect x="0" y="0" width="400" height="240" fill="' + wallColor + '"/>' +
           '<rect x="0" y="240" width="400" height="60" fill="#b89f7c"/>' +
           '<rect x="0" y="237" width="400" height="4" fill="#a0885f"/>' +
           '<line x1="200" y1="0" x2="200" y2="60" stroke="#2a241c" stroke-width="2"/>' +
           '<path d="M175 60 L225 60 L215 105 L185 105 Z" fill="#2a241c"/>' +
           '<circle cx="200" cy="110" r="5" fill="#ffd989"/>' +
           '<rect x="80" y="195" width="240" height="12" fill="#7a5c3e"/>' +
           '<rect x="95" y="207" width="8" height="45" fill="#7a5c3e"/>' +
           '<rect x="297" y="207" width="8" height="45" fill="#7a5c3e"/>' +
           '<rect x="110" y="170" width="30" height="50" fill="#1f1813"/>' +
           '<rect x="260" y="170" width="30" height="50" fill="#1f1813"/>' +
           '<rect x="110" y="220" width="30" height="30" fill="#1f1813"/>' +
           '<rect x="260" y="220" width="30" height="30" fill="#1f1813"/>' +
           '<ellipse cx="200" cy="195" rx="14" ry="5" fill="#3a2a1a"/>' +
           '<path d="M186 195 L214 195 L210 180 L190 180 Z" fill="#c9a96d"/>' +
           '<circle cx="200" cy="175" r="4" fill="#e3ded3"/>' +
         '</svg>',
      3: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
           '<rect x="0" y="0" width="400" height="240" fill="' + wallColor + '"/>' +
           '<rect x="0" y="240" width="400" height="60" fill="#b89f7c"/>' +
           '<rect x="0" y="237" width="400" height="4" fill="#a0885f"/>' +
           '<path d="M140 50 Q140 20 200 20 Q260 20 260 50 L260 190 L140 190 Z" fill="#c8dadf" stroke="#2a241c" stroke-width="4"/>' +
           '<path d="M155 150 Q200 120 245 150 L245 180 L155 180 Z" fill="#b8c8cc" opacity="0.6"/>' +
           '<rect x="80" y="200" width="240" height="12" fill="#3d2f24"/>' +
           '<rect x="92" y="212" width="8" height="38" fill="#3d2f24"/>' +
           '<rect x="300" y="212" width="8" height="38" fill="#3d2f24"/>' +
           '<ellipse cx="130" cy="197" rx="14" ry="5" fill="#1f1813"/>' +
           '<path d="M117 197 L143 197 L140 175 L120 175 Z" fill="#f0e8d4"/>' +
           '<circle cx="130" cy="168" r="13" fill="#607a5a"/>' +
           '<circle cx="120" cy="160" r="8" fill="#526b4d"/>' +
           '<circle cx="140" cy="163" r="10" fill="#506b4d"/>' +
           '<rect x="240" y="189" width="40" height="12" fill="#7a5c3e"/>' +
           '<rect x="240" y="181" width="40" height="9" fill="#9a6d3f"/>' +
           '<rect x="240" y="173" width="40" height="9" fill="#5a3a2a"/>' +
         '</svg>',
      4: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
           '<rect x="0" y="0" width="400" height="240" fill="' + wallColor + '"/>' +
           '<rect x="0" y="240" width="400" height="60" fill="#b89f7c"/>' +
           '<rect x="0" y="237" width="400" height="4" fill="#a0885f"/>' +
           '<rect x="220" y="80" width="160" height="6" fill="#3d2f24"/>' +
           '<rect x="230" y="55" width="14" height="25" fill="#7a5c3e"/>' +
           '<rect x="250" y="50" width="14" height="30" fill="#a06a3e"/>' +
           '<rect x="270" y="60" width="14" height="20" fill="#7a5c3e"/>' +
           '<rect x="295" y="55" width="30" height="25" fill="#3d2f24"/>' +
           '<rect x="335" y="63" width="12" height="17" fill="#d0a972"/>' +
           '<rect x="40" y="200" width="240" height="10" fill="#3d2f24"/>' +
           '<rect x="50" y="210" width="8" height="50" fill="#3d2f24"/>' +
           '<rect x="265" y="210" width="8" height="50" fill="#3d2f24"/>' +
           '<rect x="110" y="140" width="120" height="70" rx="4" fill="#1a1612"/>' +
           '<rect x="160" y="210" width="20" height="15" fill="#1a1612"/>' +
           '<rect x="250" y="160" width="4" height="40" fill="#1a1612"/>' +
           '<path d="M240 160 L270 160 L265 145 L245 145 Z" fill="#1a1612"/>' +
           '<path d="M300 210 Q300 170 330 170 Q360 170 360 210 L360 260 L300 260 Z" fill="#2a241c"/>' +
         '</svg>',
      5: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
           '<rect x="0" y="0" width="400" height="240" fill="' + wallColor + '"/>' +
           '<rect x="0" y="240" width="400" height="60" fill="#b89f7c"/>' +
           '<rect x="0" y="237" width="400" height="4" fill="#a0885f"/>' +
           '<path d="M80 60 Q80 30 130 30 Q180 30 180 60 L180 180 L80 180 Z" fill="#e1c9a3" stroke="#2a241c" stroke-width="3" opacity="0.9"/>' +
           '<path d="M240 190 Q240 150 290 150 Q340 150 340 190 L340 260 L310 260 L310 240 L270 240 L270 260 L240 260 Z" fill="#3d2f24"/>' +
           '<rect x="258" y="185" width="60" height="35" rx="12" fill="#e3d4b5"/>' +
           '<rect x="350" y="210" width="25" height="40" fill="#2a241c"/>' +
           '<circle cx="362" cy="190" r="18" fill="#596b4c"/>' +
           '<circle cx="350" cy="180" r="10" fill="#6a7a56"/>' +
           '<circle cx="374" cy="184" r="12" fill="#506045"/>' +
           '<path d="M350 175 Q362 165 374 175" stroke="#6a7a56" stroke-width="2" fill="none"/>' +
         '</svg>'
    };
    return scenes[variant] || scenes[0];
  }

  var sceneLabels = ['Stue', 'Soveværelse', 'Spisestue', 'Entré', 'Kontor', 'Accent-væg'];

  // ─── Real-photo overrides (keyed by DLM code) ──────────────────────
  // Built from a JSON <script> in the section. When a hovered color has an
  // entry here, we render the photo instead of the stylised SVG room.
  var colorPhotos = {};
  var photosEl = document.getElementById('vf-color-photos');
  if (photosEl) {
    try { colorPhotos = JSON.parse(photosEl.textContent) || {}; }
    catch (e) { console.error('Vores farver: failed to parse color photos map', e); }
  }

  function sceneMarkup(idx, code, hex, name) {
    var photoUrl = colorPhotos[code];
    if (photoUrl) {
      return '<img src="' + photoUrl + '" alt="' + (name || '') +
             '" class="vores-farver__hover-preview-photo" loading="lazy">';
    }
    return roomSVG(idx % 6, hex);
  }

  // ─── Hover preview ─────────────────────────────────────────────────
  var swatches = grid.querySelectorAll('.vores-farver__swatch:not(.vores-farver__swatch--empty)');
  var hoverTimer;

  swatches.forEach(function (sw, idx) {
    sw.addEventListener('mouseenter', function () {
      var name = sw.dataset.colorName;
      var code = sw.dataset.colorCode;
      var hex  = sw.dataset.colorHex;
      hoverScene.innerHTML = sceneMarkup(idx, code, hex, name);
      hoverName.textContent = name;
      hoverCode.textContent = code;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () {
        hoverPreview.dataset.visible = 'true';
        hoverPreview.setAttribute('aria-hidden', 'false');
      }, 60);
    });
    sw.addEventListener('mouseleave', function (e) {
      // Only hide if leaving toward something other than another swatch
      var to = e.relatedTarget;
      if (!to || (to.closest && !to.closest('.vores-farver__swatch'))) {
        clearTimeout(hoverTimer);
        hoverPreview.dataset.visible = 'false';
        hoverPreview.setAttribute('aria-hidden', 'true');
      }
    });
  });

  document.addEventListener('mousemove', function (e) {
    if (hoverPreview.dataset.visible !== 'true') return;
    var x = e.clientX + 18;
    var y = e.clientY + 18;
    var pw = hoverPreview.offsetWidth;
    var ph = hoverPreview.offsetHeight;
    if (x + pw > window.innerWidth - 12)  x = e.clientX - pw - 18;
    if (y + ph > window.innerHeight - 12) y = e.clientY - ph - 18;
    hoverPreview.style.left = x + 'px';
    hoverPreview.style.top  = y + 'px';
  });

  // ─── Click → expand inspiration ────────────────────────────────────
  swatches.forEach(function (sw) {
    sw.addEventListener('click', function () {
      swatches.forEach(function (s) { s.classList.remove('vores-farver__swatch--selected'); });
      sw.classList.add('vores-farver__swatch--selected');
      openInspiration({
        name: sw.dataset.colorName,
        code: sw.dataset.colorCode,
        hex:  sw.dataset.colorHex,
      });
    });
  });

  // ─── 3-step configurator config ────────────────────────────────────
  // Surface → finishes. Each finish.handle must match a real Shopify
  // product handle present in the variant map above. Add/remove
  // finishes as new products go live; keep them in sync with the
  // cfg_handles list in kmeconsulting-product-finder.liquid.
  var CFG_SURFACES = {
    'Vægge': {
      subtitle: 'Indendørs',
      tag: 'DET MEST ALMINDELIGE',
      finishes: [
        { glans: 'Glans 5',  name: 'Helmat', desc: 'Skjuler ujævnheder. Det rolige valg.', handle: 'vaegmaling-glans-5' },
        { glans: 'Glans 10', name: 'Mat',    desc: 'Lidt mere lys. Nemmere at tørre af.', handle: 'vaegmaling-glans-10', popular: true }
      ]
    },
    'Loft': {
      subtitle: 'Indendørs',
      tag: 'LYSE OG LETTE FARVER',
      finishes: [
        { glans: 'Glans 2', name: 'Helmat',     desc: 'Det klassiske loftvalg.', handle: 'loftmaling-glans-2' },
        { glans: 'Glans 5', name: 'Blød glans', desc: 'Let glans, nem at tørre af.', handle: 'loftmaling-glans-5', popular: true }
      ]
    },
    'Træværk': {
      subtitle: 'Døre, lister, paneler',
      tag: 'SLIDSTÆRK FINISH',
      finishes: [
        { glans: 'Glans 30', name: 'Halvmat',   desc: 'Mat finish til træværk.', handle: 'trae-metal-glans-30' },
        { glans: 'Glans 40', name: 'Halvblank', desc: 'Klassisk slidstærkt valg.', handle: 'trae-metal-glans-40', popular: true }
      ]
    },
    'Facade': {
      subtitle: 'Udendørs',
      tag: 'VEJRBESTANDIG SILIKONE',
      finishes: [
        { glans: 'Glans 20', name: 'Træbeskyttelse', desc: 'Vejrbestandig udendørs.', handle: 'traebeskyttelse-glans-20', auto: true }
      ]
    }
  };

  // Real variant sizes. `option` matches the Størrelse option value on
  // the Shopify variant; `label` is shown in the chip + summary.
  var CFG_SIZES = [
    { option: '5L',  label: '5 L',  coverage: '~40 m²' },
    { option: '10L', label: '10 L', coverage: '~80 m²', popular: true },
    { option: '20L', label: '20 L', coverage: '~160 m²' }
  ];

  // Sample product variant ID — wire when a sample SKU exists.
  var SAMPLE_VARIANT_ID = null;
  var SAMPLE_PRICE = '49,–';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pickDefault(items, key) {
    if (!items.length) return null;
    var pop = items.find(function (i) { return i.popular || i.auto; });
    return pop ? pop[key] : items[0][key];
  }

  function openInspiration(c) {
    colorNameEl.textContent = c.name;
    swatchName.textContent  = c.name;
    swatchCode.textContent  = c.code;
    swatchChip.style.backgroundColor = c.hex;
    inspiration.style.setProperty('--insp-color', c.hex);

    renderPhoto(c);
    renderConfigurator(c);

    inspiration.dataset.open = 'true';
    setTimeout(function () {
      var target = inspiration.querySelector('.vores-farver__inspiration-inner') || inspiration;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  }

  function renderPhoto(c) {
    if (!photoMount) return;
    var photoUrl = colorPhotos[c.code];
    var scene = photoUrl
      ? '<img src="' + photoUrl + '" alt="' + escapeHtml(c.name) + ' i stue" loading="lazy">'
      : roomSVG(0, c.hex);
    photoMount.innerHTML =
      '<div class="vf-photo__tile">' +
        '<span class="vf-photo__label">Stue</span>' +
        scene +
      '</div>';
  }

  // ─── 3-step configurator ───────────────────────────────────────────
  function renderConfigurator(c) {
    if (!cfgMount) return;

    // Default state: Vægge → Glans 10 → 2,5 L (or whatever's flagged
    // popular). Tracks across re-renders only if the same color is
    // picked again — fresh color picks reset to defaults.
    var defaultSurface = 'Vægge';
    var defaultFinish  = pickDefault(CFG_SURFACES[defaultSurface].finishes, 'glans');
    var defaultSize    = pickDefault(CFG_SIZES, 'option');

    var state = {
      color:   c,
      surface: defaultSurface,
      finish:  defaultFinish,
      size:    defaultSize,
    };

    cfgMount.innerHTML = configuratorHTML();
    bindRadios();
    bindCTAs();
    syncAll();

    // ── render helpers ─────────────────────────────────────────────
    function configuratorHTML() {
      return (
        '<div class="vf-cfg__steps">' +
          surfaceStep() +
          finishStep() +
          sizeStep() +
        '</div>' +
        decisionCard()
      );
    }

    function surfaceStep() {
      return (
        '<div class="vf-cfg__step" data-step="surface">' +
          '<div class="vf-cfg__legend">' +
            '<span class="vf-cfg__step-num">01</span>' +
            '<span class="vf-cfg__step-title">Hvor skal du male?</span>' +
          '</div>' +
          '<div class="vf-cfg__surface-grid" role="radiogroup" aria-label="Hvor skal du male?" data-group="surface">' +
            Object.keys(CFG_SURFACES).map(function (name) {
              var s = CFG_SURFACES[name];
              return (
                '<button type="button" class="vf-cfg__surface" role="radio" ' +
                  'aria-checked="false" tabindex="-1" data-value="' + escapeHtml(name) + '">' +
                  '<span class="vf-cfg__surface-title">' + escapeHtml(name) + '</span>' +
                  '<span class="vf-cfg__surface-sub">' + escapeHtml(s.subtitle) + '</span>' +
                  '<span class="vf-cfg__surface-tag">' + escapeHtml(s.tag) + '</span>' +
                '</button>'
              );
            }).join('') +
          '</div>' +
        '</div>'
      );
    }

    function finishStep() {
      return (
        '<div class="vf-cfg__step" data-step="finish">' +
          '<div class="vf-cfg__legend">' +
            '<span class="vf-cfg__step-num">02</span>' +
            '<span class="vf-cfg__step-title">Vælg finish</span>' +
          '</div>' +
          '<div class="vf-cfg__finish-grid" role="radiogroup" aria-label="Vælg finish" data-group="finish">' +
            '<!-- populated by syncFinish() -->' +
          '</div>' +
        '</div>'
      );
    }

    function sizeStep() {
      return (
        '<div class="vf-cfg__step" data-step="size">' +
          '<div class="vf-cfg__legend">' +
            '<span class="vf-cfg__step-num">03</span>' +
            '<span class="vf-cfg__step-title">Vælg størrelse</span>' +
          '</div>' +
          '<div class="vf-cfg__size-grid" role="radiogroup" aria-label="Vælg størrelse" data-group="size">' +
            CFG_SIZES.map(function (s) {
              return (
                '<button type="button" class="vf-cfg__size" role="radio" ' +
                  'aria-checked="false" tabindex="-1" data-value="' + escapeHtml(s.option) + '">' +
                  '<span class="vf-cfg__size-label">' + escapeHtml(s.label) + '</span>' +
                  '<span class="vf-cfg__size-coverage">' + escapeHtml(s.coverage) + '</span>' +
                '</button>'
              );
            }).join('') +
          '</div>' +
        '</div>'
      );
    }

    function decisionCard() {
      var sampleHidden  = SAMPLE_VARIANT_ID ? '' : 'hidden';
      var dropletIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 2.5c-3 5-7 8.5-7 12.5a7 7 0 0 0 14 0c0-4-4-7.5-7-12.5z"/></svg>';
      var cartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>' +
        '<path d="M2 3h3l2.5 12.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L22 7H7"/></svg>';
      var checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
        '<path d="M5 12l5 5L20 7"/></svg>';

      return (
        '<aside class="vf-cfg__decision" aria-label="Dit valg">' +
          '<div class="vf-cfg__product-preview">' +
            '<img data-product-image src="" alt="" loading="lazy">' +
          '</div>' +

          '<dl class="vf-cfg__summary">' +
            '<div><dt>Farve</dt><dd>' + escapeHtml(c.name) + '</dd></div>' +
            '<div><dt>Overflade</dt><dd data-summary="surface">—</dd></div>' +
            '<div><dt>Finish</dt><dd data-summary="finish">—</dd></div>' +
            '<div><dt>Størrelse</dt><dd data-summary="size">—</dd></div>' +
          '</dl>' +

          '<p class="vf-cfg__cta-eyebrow">Hvordan vil du starte?</p>' +

          '<button type="button" class="vf-cfg__cta vf-cfg__cta--sample" ' +
            'data-action="add-sample" ' + sampleHidden + '>' +
            '<span class="vf-cfg__cta-icon">' + dropletIcon + '</span>' +
            '<span class="vf-cfg__cta-label">Bestil prøve først</span>' +
            '<span class="vf-cfg__cta-price">' + escapeHtml(SAMPLE_PRICE) + '</span>' +
            '<span class="vf-cfg__cta-sub">A5 pap-prøve · gratis fragt · 2–3 dage</span>' +
          '</button>' +

          (SAMPLE_VARIANT_ID ? '<div class="vf-cfg__or">eller</div>' : '') +

          '<button type="button" class="vf-cfg__cta vf-cfg__cta--primary" ' +
            'data-action="add-to-cart">' +
            '<span class="vf-cfg__cta-icon">' + cartIcon + '</span>' +
            '<span class="vf-cfg__cta-label">Læg malingen i kurv</span>' +
            '<span class="vf-cfg__cta-price" data-price>—</span>' +
            '<span class="vf-cfg__cta-sub" data-cart-sub>—</span>' +
          '</button>' +

          (SAMPLE_VARIANT_ID
            ? '<p class="vf-cfg__hint">' + checkIcon +
              '<span>Usikker? Start med en prøve — vi trækker ' + escapeHtml(SAMPLE_PRICE) +
              ' fra ved køb af maling.</span></p>'
            : '') +

          '<p class="vf-cfg__error" data-error hidden role="alert"></p>' +
        '</aside>'
      );
    }

    // ── selection / sync ───────────────────────────────────────────
    function syncAll() {
      syncSurface();
      syncFinish();
      syncSize();
      syncSummary();
      syncPrice();
      syncProductPreview();
    }

    // Show the actual Shopify product/variant image at the top of the
    // decision card. Falls back to hiding the <img> when no image is
    // available (e.g. a product without uploaded media).
    function syncProductPreview() {
      var v = currentVariant();
      var img = cfgMount.querySelector('[data-product-image]');
      if (!img) return;
      if (v && v.image) {
        img.src = v.image;
        img.alt = v.product_title || '';
        img.style.display = '';
      } else {
        img.removeAttribute('src');
        img.alt = '';
        img.style.display = 'none';
      }
    }

    function syncRadios(group, value) {
      var radios = cfgMount.querySelectorAll('[data-group="' + group + '"] [role="radio"]');
      radios.forEach(function (r) {
        var match = r.dataset.value === value;
        r.setAttribute('aria-checked', match ? 'true' : 'false');
        r.tabIndex = match ? 0 : -1;
      });
    }

    function syncSurface() { syncRadios('surface', state.surface); }

    function syncFinish() {
      var grid = cfgMount.querySelector('[data-group="finish"]');
      if (!grid) return;
      var entry = CFG_SURFACES[state.surface];
      var finishes = (entry && entry.finishes) || [];
      // Validate state.finish against the new surface's finishes
      var stillValid = finishes.find(function (f) { return f.glans === state.finish; });
      if (!stillValid) state.finish = pickDefault(finishes, 'glans');

      grid.innerHTML = finishes.map(function (f) {
        var checked = f.glans === state.finish;
        var badge = f.popular ? '<span class="vf-cfg__badge">Populær</span>'
                  : f.auto    ? '<span class="vf-cfg__badge">Auto-valgt</span>'
                  : '';
        return (
          '<button type="button" class="vf-cfg__finish" role="radio" ' +
            'aria-checked="' + (checked ? 'true' : 'false') + '" ' +
            'tabindex="' + (checked ? 0 : -1) + '" data-value="' + escapeHtml(f.glans) + '">' +
            '<span class="vf-cfg__finish-glans">' + escapeHtml(f.glans) + '</span>' +
            '<span class="vf-cfg__finish-name">' + escapeHtml(f.name) + '</span>' +
            '<span class="vf-cfg__finish-desc">' + escapeHtml(f.desc) + '</span>' +
            badge +
          '</button>'
        );
      }).join('');
    }

    function syncSize() { syncRadios('size', state.size); }

    function syncSummary() {
      var entry = CFG_SURFACES[state.surface] || { finishes: [] };
      var fin = entry.finishes.find(function (f) { return f.glans === state.finish; });
      var sz  = CFG_SIZES.find(function (s) { return s.option === state.size; });

      setText('[data-summary="surface"]', state.surface || '—');
      setText('[data-summary="finish"]', fin ? (fin.glans + ' · ' + fin.name) : '—');
      setText('[data-summary="size"]',
        sz ? (sz.label + ' · dækker ' + sz.coverage) : '—');
      setText('[data-summary-mini="size"]', sz ? sz.label : '—');
    }

    function syncPrice() {
      var v = currentVariant();
      var entry = CFG_SURFACES[state.surface];
      var fin = entry && entry.finishes.find(function (f) { return f.glans === state.finish; });
      var sz = CFG_SIZES.find(function (s) { return s.option === state.size; });
      var subBits = [];
      if (fin) subBits.push(fin.glans);
      if (sz) subBits.push(sz.label);
      subBits.push(v && v.available ? 'klar til afhentning' : 'udsolgt');

      setText('[data-price]', v ? v.price : '—');
      setText('[data-cart-sub]', subBits.join(' · '));

      var btn = cfgMount.querySelector('[data-action="add-to-cart"]');
      if (btn) btn.disabled = !v || !v.available;
    }

    // Resolve the exact variant for the current (handle, color, size).
    // Returns undefined when the combo doesn't exist in the variant
    // map — usually a sign the merchant needs to add the product to
    // the cfg_handles list in the section liquid.
    function currentVariant() {
      var entry = CFG_SURFACES[state.surface];
      var fin = entry && entry.finishes.find(function (f) { return f.glans === state.finish; });
      var handle = fin && fin.handle;
      if (!handle) return undefined;
      return variantsByKey.get(handle + '||' + c.name + '||' + state.size);
    }

    function setText(sel, value) {
      var el = cfgMount.querySelector(sel);
      if (el) el.textContent = value;
    }

    function showError(msg) {
      var el = cfgMount.querySelector('[data-error]');
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
    }

    function hideError() {
      var el = cfgMount.querySelector('[data-error]');
      if (el) el.hidden = true;
    }

    // ── event wiring ───────────────────────────────────────────────
    function bindRadios() {
      cfgMount.addEventListener('click', function (e) {
        var radio = e.target.closest('[role="radio"]');
        if (!radio) return;
        var group = radio.closest('[data-group]');
        if (!group) return;
        applySelection(group.dataset.group, radio.dataset.value);
      });

      cfgMount.addEventListener('keydown', function (e) {
        var radio = e.target.closest('[role="radio"]');
        if (!radio) return;
        var group = radio.closest('[data-group]');
        if (!group) return;
        var radios = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
        var idx = radios.indexOf(radio);
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
            applySelection(group.dataset.group, radio.dataset.value);
            return;
        }
        if (next) {
          e.preventDefault();
          next.focus();
          applySelection(group.dataset.group, next.dataset.value);
        }
      });
    }

    function applySelection(group, value) {
      if (group === 'surface') {
        if (state.surface === value) return;
        state.surface = value;
        syncSurface();
        syncFinish();
        syncSummary();
        syncPrice();
        syncProductPreview();
      } else if (group === 'finish') {
        if (state.finish === value) return;
        state.finish = value;
        // Re-render finish to update aria-checked + selected card style
        var grid = cfgMount.querySelector('[data-group="finish"]');
        if (grid) {
          grid.querySelectorAll('[role="radio"]').forEach(function (r) {
            var match = r.dataset.value === value;
            r.setAttribute('aria-checked', match ? 'true' : 'false');
            r.tabIndex = match ? 0 : -1;
          });
        }
        syncSummary();
        syncPrice();
        syncProductPreview();
      } else if (group === 'size') {
        if (state.size === value) return;
        state.size = value;
        syncSize();
        syncSummary();
        syncPrice();
        syncProductPreview();
      }
    }

    function bindCTAs() {
      cfgMount.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'add-to-cart') addToCart(btn);
        else if (btn.dataset.action === 'add-sample') addSample(btn);
      });
    }

    function addToCart(btn) {
      var v = currentVariant();
      if (!v) {
        showError('Vi kunne ikke finde varianten for denne kombination.');
        return;
      }
      if (!v.available) {
        showError('Denne størrelse er desværre udsolgt.');
        return;
      }
      btn.disabled = true;
      hideError();
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          id: v.variant_id,
          quantity: 1,
          properties: {
            'Farvekode': c.code,
          },
        }),
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (j) {
          throw new Error(j.description || j.message || 'Cart add failed');
        });
        return res.json();
      }).then(function () {
        window.location.href = '/cart';
      }).catch(function (err) {
        btn.disabled = false;
        showError(err.message || 'Noget gik galt — prøv igen.');
      });
    }

    function addSample(btn) {
      if (!SAMPLE_VARIANT_ID) {
        showError('Prøvebøtten er endnu ikke konfigureret.');
        return;
      }
      btn.disabled = true;
      hideError();
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          id: SAMPLE_VARIANT_ID,
          quantity: 1,
          properties: {
            'Farve': c.name,
            'Farvekode': c.code,
            'Reference': state.surface || '',
          },
        }),
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (j) {
          throw new Error(j.description || j.message || 'Cart add failed');
        });
        return res.json();
      }).then(function () {
        window.location.href = '/cart';
      }).catch(function (err) {
        btn.disabled = false;
        showError(err.message || 'Noget gik galt — prøv igen.');
      });
    }
  }
})();
