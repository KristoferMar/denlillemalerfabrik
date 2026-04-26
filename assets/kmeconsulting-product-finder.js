(function () {
  // ─── DOM ───────────────────────────────────────────────────────────
  var grid          = document.getElementById('vores-farver-grid');
  if (!grid) return;
  var hoverPreview  = document.getElementById('vf-hover-preview');
  var hoverScene    = document.getElementById('vf-hover-preview-scene');
  var hoverName     = document.getElementById('vf-hover-name');
  var hoverCode     = document.getElementById('vf-hover-code');
  var inspiration   = document.getElementById('vores-farver-inspiration');
  var inspGallery   = document.getElementById('vf-gallery');
  var inspProducts  = document.getElementById('vf-products');
  var colorNameEl   = document.getElementById('vf-color-name');
  var swatchChip    = document.getElementById('vf-swatch-chip');
  var swatchName    = document.getElementById('vf-swatch-name');
  var swatchCode    = document.getElementById('vf-swatch-code');

  // ─── Variant map (built from Liquid) ───────────────────────────────
  var variantIndex = new Map(); // key: "paint_type||color" → entry
  var mapEl = document.getElementById('product-finder-variant-map');
  if (mapEl) {
    try {
      var parsed = JSON.parse(mapEl.textContent);
      (parsed.variants || []).forEach(function (v) {
        variantIndex.set(v.paint_type + '||' + v.color, v);
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

  // ─── Hover preview ─────────────────────────────────────────────────
  var swatches = grid.querySelectorAll('.vores-farver__swatch:not(.vores-farver__swatch--empty)');
  var hoverTimer;

  swatches.forEach(function (sw, idx) {
    sw.addEventListener('mouseenter', function () {
      var name = sw.dataset.colorName;
      var code = sw.dataset.colorCode;
      var hex  = sw.dataset.colorHex;
      hoverScene.innerHTML = roomSVG(idx % 6, hex);
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

  function openInspiration(c) {
    colorNameEl.textContent = c.name;
    swatchName.textContent  = c.name;
    swatchCode.textContent  = c.code;
    swatchChip.style.backgroundColor = c.hex;
    inspiration.style.setProperty('--insp-color', c.hex);

    // 6-tile gallery
    inspGallery.innerHTML = [0, 1, 2, 3, 4, 5].map(function (v) {
      return '<div class="vores-farver__tile">' +
               '<span class="vores-farver__tile-label">' + sceneLabels[v] + '</span>' +
               roomSVG(v, c.hex) +
             '</div>';
    }).join('');

    // Product cards: every paint-type for this color, pre-selected via variant ID
    var paintTypes = ['Vægmaling', 'Loftmaling', 'Træ & Metal', 'Strukturmaling', 'Træbeskyttelse', 'Gulvmaling'];
    var typeDescriptions = {
      'Vægmaling': 'Til vægge — silkemat',
      'Loftmaling': 'Til lofter — mat',
      'Træ & Metal': 'Til træværk — halvmat',
      'Strukturmaling': 'Tyk dekorativ struktur',
      'Træbeskyttelse': 'Udendørs træ — halvmat',
      'Gulvmaling': 'Til indendørs gulve',
    };
    var cards = paintTypes.map(function (pt) {
      var v = variantIndex.get(pt + '||' + c.name);
      if (!v) return '';
      var url = '/products/' + v.handle + '?variant=' + v.variant_id;
      return '<a class="vores-farver__product" href="' + url + '">' +
               '<div class="vores-farver__product-thumb"></div>' +
               '<div class="vores-farver__product-meta">' +
                 '<h4 class="vores-farver__product-name">' + v.product_title + '</h4>' +
                 '<p class="vores-farver__product-desc">' + (typeDescriptions[pt] || '') + '</p>' +
                 '<div class="vores-farver__product-price">Fra ' + v.price + '</div>' +
               '</div>' +
             '</a>';
    }).join('');
    inspProducts.innerHTML = cards || '<p style="grid-column:1/-1;opacity:0.6">Ingen produkter fundet for denne farve.</p>';

    inspiration.dataset.open = 'true';
    setTimeout(function () {
      inspiration.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  }
})();
