(function () {
  const state = {
    step: 1,
    selectedColor: null,
    selectedType: null,
  };

  const selectors = {
    container: '#product-finder',
    steps: '.product-finder__step',
    stepIndicators: '.product-finder__step-indicator',
    colorButtons: '.product-finder__color-btn',
    typeButtons: '.product-finder__type-btn',
    backButtons: '.product-finder__back-btn',
    resetButton: '#product-finder-reset',
    resultContainer: '#product-finder-result',
    selectedColorName: '#pf-selected-color-name',
    selectedTypeName: '#pf-selected-type-name',
    variantMap: '#product-finder-variant-map',
  };

  let variantIndex = new Map(); // key: "paint_type||color" → variant entry
  let initialized = false;

  function init() {
    const container = document.querySelector(selectors.container);
    if (!container) return;

    // Load the variant map (paint_type + color → {handle, variant_id, ...})
    const dataEl = document.querySelector(selectors.variantMap);
    if (dataEl) {
      try {
        const parsed = JSON.parse(dataEl.textContent);
        (parsed.variants || []).forEach(function (v) {
          variantIndex.set(v.paint_type + '||' + v.color, v);
        });
      } catch (e) {
        console.error('Product finder: failed to parse variant map', e);
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
        showStep(1);
      });
    }
  }

  function showStep(stepNumber) {
    state.step = stepNumber;

    // Fade out current step, then fade in new step
    var currentStep = document.querySelector(selectors.steps + ':not([hidden])');
    var nextStep = document.querySelector(selectors.steps + '[data-step="' + stepNumber + '"]');

    function showNext() {
      document.querySelectorAll(selectors.steps).forEach(function (step) {
        step.hidden = true;
        step.classList.remove('product-finder__step--fade-out', 'product-finder__step--fade-in');
      });
      if (nextStep) {
        nextStep.hidden = false;
        void nextStep.offsetWidth;
        nextStep.classList.add('product-finder__step--fade-in');
      }
    }

    if (currentStep && currentStep !== nextStep) {
      currentStep.classList.remove('product-finder__step--fade-in');
      void currentStep.offsetWidth;
      currentStep.classList.add('product-finder__step--fade-out');
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
      indicator.classList.toggle('product-finder__step-indicator--active', num === stepNumber);
      indicator.classList.toggle('product-finder__step-indicator--completed', num < stepNumber);
    });

    // Scroll to top of section (skip on initial page load)
    if (initialized) {
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
    initialized = true;
  }

  function showResult() {
    showStep(3);

    var resultContainer = document.querySelector(selectors.resultContainer);
    var colorNameEl = document.querySelector(selectors.selectedColorName);
    var typeNameEl = document.querySelector(selectors.selectedTypeName);

    if (colorNameEl) colorNameEl.textContent = state.selectedColor.name + ' (' + state.selectedColor.code + ')';
    if (typeNameEl) typeNameEl.textContent = state.selectedType.name;

    if (!resultContainer) return;

    // Show loading bar first
    resultContainer.innerHTML =
      '<div class="product-finder__loader">' +
      '<span class="product-finder__loader-text">Matcher produkter...</span>' +
      '<div class="product-finder__loader-track">' +
      '<div class="product-finder__loader-bar"></div>' +
      '</div>' +
      '</div>';

    // Wait for loading animation, then show the single matching variant.
    setTimeout(function () {
      var key = state.selectedType.name + '||' + state.selectedColor.name;
      var match = variantIndex.get(key);

      if (!match) {
        resultContainer.innerHTML =
          '<div class="product-finder__no-result">' +
          '<p>Vi har desværre ikke et produkt der matcher denne kombination endnu.</p>' +
          '<p>Prøv en anden farve eller overfladetype.</p>' +
          '</div>';
        return;
      }

      // Link to the PDP with the variant pre-selected server-side.
      var url = '/products/' + match.handle + '?variant=' + match.variant_id;
      resultContainer.innerHTML =
        '<div class="product-finder__products product-finder__products--single">' +
        '<a href="' + url + '" class="product-finder__product-card">' +
        (match.image
          ? '<img class="product-finder__product-image" src="' + match.image + '" alt="' + match.product_title + ' – ' + match.color + '" loading="lazy">'
          : '<div class="product-finder__product-image product-finder__product-image--placeholder"></div>') +
        '<div class="product-finder__product-info">' +
        '<h3 class="product-finder__product-title">' + match.product_title + '</h3>' +
        '<p class="product-finder__product-price">Fra ' + match.price + '</p>' +
        '</div>' +
        '<span class="product-finder__product-cta">Se produkt med ' + match.color + ' forvalgt →</span>' +
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
