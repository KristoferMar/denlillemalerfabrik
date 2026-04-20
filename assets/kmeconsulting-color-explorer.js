(function () {
  var PREFIX = 'color-explorer';

  var state = {
    step: 1,
    selectedColor: null,
    selectedType: null,
  };

  var selectors = {
    container: '#color-explorer',
    steps: '.' + PREFIX + '__step',
    stepIndicators: '.' + PREFIX + '__step-indicator',
    colorButtons: '.' + PREFIX + '__color-btn',
    typeButtons: '.' + PREFIX + '__type-btn',
    backButtons: '.' + PREFIX + '__back-btn',
    resetButton: '#color-explorer-reset',
    resultContainer: '#color-explorer-result',
    resultColor: '#ce-result-color',
    resultType: '#ce-result-type',
    productsData: '#color-explorer-data',
    searchInput: '#color-explorer-search',
    colorGrid: '#color-explorer-grid',
    noResults: '#color-explorer-no-results',
    selectedSwatch: '#ce-selected-swatch',
    selectedName: '#ce-selected-name',
  };

  var variantIndex = new Map(); // key: "paint_type||color" → variant entry

  function init() {
    var container = document.querySelector(selectors.container);
    if (!container) return;

    var dataEl = document.querySelector(selectors.productsData);
    if (dataEl) {
      try {
        var parsed = JSON.parse(dataEl.textContent);
        (parsed.variants || []).forEach(function (v) {
          variantIndex.set(v.paint_type + '||' + v.color, v);
        });
      } catch (e) {
        console.error('Color explorer: failed to parse variant map', e);
      }
    }

    bindEvents();
    showStep(1);
  }

  function bindEvents() {
    // Color selection
    document.querySelectorAll(selectors.colorButtons).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedColor = {
          id: btn.dataset.colorId,
          name: btn.dataset.colorName,
          code: btn.dataset.colorCode,
          hex: btn.dataset.colorHex,
        };
        showStep(2);
      });
    });

    // Type selection
    document.querySelectorAll(selectors.typeButtons).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedType = {
          id: btn.dataset.typeId,
          name: btn.dataset.typeName,
        };
        showResult();
      });
    });

    // Back buttons
    document.querySelectorAll(selectors.backButtons).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = parseInt(btn.dataset.backTo, 10);
        showStep(target);
      });
    });

    // Reset
    var resetBtn = document.querySelector(selectors.resetButton);
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.selectedColor = null;
        state.selectedType = null;
        var searchInput = document.querySelector(selectors.searchInput);
        if (searchInput) searchInput.value = '';
        filterColors('');
        showStep(1);
      });
    }

    // Search
    var searchInput = document.querySelector(selectors.searchInput);
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterColors(searchInput.value);
      });
    }
  }

  function filterColors(query) {
    var q = query.toLowerCase().trim();
    var buttons = document.querySelectorAll(selectors.colorButtons);
    var noResults = document.querySelector(selectors.noResults);
    var visibleCount = 0;

    buttons.forEach(function (btn) {
      var name = (btn.dataset.colorName || '').toLowerCase();
      var code = (btn.dataset.colorCode || '').toLowerCase();
      var matches = !q || name.indexOf(q) !== -1 || code.indexOf(q) !== -1;
      btn.hidden = !matches;
      if (matches) visibleCount++;
    });

    if (noResults) {
      noResults.hidden = visibleCount > 0;
    }
  }

  function showStep(stepNumber) {
    state.step = stepNumber;

    // Update selected color summary in step 2
    if (stepNumber === 2 && state.selectedColor) {
      var swatch = document.querySelector(selectors.selectedSwatch);
      var name = document.querySelector(selectors.selectedName);
      if (swatch) swatch.style.backgroundColor = state.selectedColor.hex;
      if (name) name.textContent = state.selectedColor.name + ' (' + state.selectedColor.code + ')';
    }

    var currentStep = document.querySelector(selectors.steps + ':not([hidden])');
    var nextStep = document.querySelector(selectors.steps + '[data-step="' + stepNumber + '"]');

    function showNext() {
      document.querySelectorAll(selectors.steps).forEach(function (step) {
        step.hidden = true;
        step.classList.remove(PREFIX + '__step--fade-out', PREFIX + '__step--fade-in');
      });
      if (nextStep) {
        nextStep.hidden = false;
        void nextStep.offsetWidth;
        nextStep.classList.add(PREFIX + '__step--fade-in');
      }
    }

    if (currentStep && currentStep !== nextStep) {
      currentStep.classList.remove(PREFIX + '__step--fade-in');
      void currentStep.offsetWidth;
      currentStep.classList.add(PREFIX + '__step--fade-out');
      currentStep.addEventListener('animationend', function handler() {
        currentStep.removeEventListener('animationend', handler);
        showNext();
      });
    } else {
      showNext();
    }

    // Update step indicators
    document.querySelectorAll(selectors.stepIndicators).forEach(function (indicator) {
      var num = parseInt(indicator.dataset.step, 10);
      indicator.classList.toggle(PREFIX + '__step-indicator--active', num === stepNumber);
      indicator.classList.toggle(PREFIX + '__step-indicator--completed', num < stepNumber);
    });

    // Scroll to top of section
    var container = document.querySelector(selectors.container);
    if (container) {
      var headerOffset = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sticky-header-offset') || '0',
        10
      );
      var top = container.getBoundingClientRect().top + window.scrollY - headerOffset - 20;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  function showResult() {
    showStep(3);

    var resultContainer = document.querySelector(selectors.resultContainer);
    var colorEl = document.querySelector(selectors.resultColor);
    var typeEl = document.querySelector(selectors.resultType);

    if (colorEl) colorEl.textContent = state.selectedColor.name + ' (' + state.selectedColor.code + ')';
    if (typeEl) typeEl.textContent = state.selectedType.name;

    if (!resultContainer) return;

    // Show loading bar
    resultContainer.innerHTML =
      '<div class="' + PREFIX + '__loader">' +
      '<span class="' + PREFIX + '__loader-text">Matcher produkter...</span>' +
      '<div class="' + PREFIX + '__loader-track">' +
      '<div class="' + PREFIX + '__loader-bar"></div>' +
      '</div>' +
      '</div>';

    setTimeout(function () {
      var key = state.selectedType.name + '||' + state.selectedColor.name;
      var match = variantIndex.get(key);

      if (!match) {
        resultContainer.innerHTML =
          '<div class="' + PREFIX + '__no-result">' +
          '<p>Vi har desværre ikke et produkt der matcher denne kombination endnu.</p>' +
          '<p>Prøv en anden farve eller overfladetype.</p>' +
          '</div>';
        return;
      }

      // Link to the PDP with the variant pre-selected server-side.
      var url = '/products/' + match.handle + '?variant=' + match.variant_id;
      resultContainer.innerHTML =
        '<div class="' + PREFIX + '__products ' + PREFIX + '__products--single">' +
        '<a href="' + url + '" class="' + PREFIX + '__product-card">' +
        (match.image
          ? '<img class="' + PREFIX + '__product-image" src="' + match.image + '" alt="' + match.product_title + ' – ' + match.color + '" loading="lazy">'
          : '<div class="' + PREFIX + '__product-image ' + PREFIX + '__product-image--placeholder"></div>') +
        '<div class="' + PREFIX + '__product-info">' +
        '<h3 class="' + PREFIX + '__product-title">' + match.product_title + '</h3>' +
        '<p class="' + PREFIX + '__product-price">Fra ' + match.price + '</p>' +
        '</div>' +
        '<span class="' + PREFIX + '__product-cta">Se produkt med ' + match.color + ' forvalgt →</span>' +
        '</a>' +
        '</div>';
    }, 1300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
