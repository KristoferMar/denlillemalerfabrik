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
    productsData: '#product-finder-data',
  };

  let products = [];

  function init() {
    const container = document.querySelector(selectors.container);
    if (!container) return;

    // Load product data from the embedded JSON
    const dataEl = document.querySelector(selectors.productsData);
    if (dataEl) {
      try {
        products = JSON.parse(dataEl.textContent);
      } catch (e) {
        console.error('Product finder: failed to parse product data', e);
      }
    }

    console.log('Product finder: loaded', products.length, 'products');
    console.log('Product finder: product data', products);

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

    // Show/hide steps
    document.querySelectorAll(selectors.steps).forEach(function (step) {
      var num = parseInt(step.dataset.step, 10);
      step.hidden = num !== stepNumber;
    });

    // Update step indicators
    document.querySelectorAll(selectors.stepIndicators).forEach(function (indicator) {
      var num = parseInt(indicator.dataset.step, 10);
      indicator.classList.toggle('product-finder__step-indicator--active', num === stepNumber);
      indicator.classList.toggle('product-finder__step-indicator--completed', num < stepNumber);
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
    var colorNameEl = document.querySelector(selectors.selectedColorName);
    var typeNameEl = document.querySelector(selectors.selectedTypeName);

    if (colorNameEl) colorNameEl.textContent = state.selectedColor.name + ' (' + state.selectedColor.code + ')';
    if (typeNameEl) typeNameEl.textContent = state.selectedType.name;

    // Find matching products by handle
    console.log('Product finder: searching for color:', state.selectedColor.id, 'type:', state.selectedType.id);
    var matches = products.filter(function (product) {
      var colorMatch = product.paint_color_id === state.selectedColor.id;
      var typeMatch = product.paint_type_id === state.selectedType.id;
      console.log('Product finder:', product.title, '| color:', product.paint_color_id, colorMatch, '| type:', product.paint_type_id, typeMatch);
      return colorMatch && typeMatch;
    });

    if (!resultContainer) return;

    if (matches.length === 0) {
      resultContainer.innerHTML =
        '<div class="product-finder__no-result">' +
        '<p>Vi har desværre ikke et produkt der matcher denne kombination endnu.</p>' +
        '<p>Prøv en anden farve eller overfladetype.</p>' +
        '</div>';
      return;
    }

    var singleClass = matches.length === 1 ? ' product-finder__products--single' : '';
    var html = '<div class="product-finder__products' + singleClass + '">';
    matches.forEach(function (product) {
      html +=
        '<a href="' + product.url + '" class="product-finder__product-card">' +
        (product.image
          ? '<img class="product-finder__product-image" src="' + product.image + '" alt="' + product.title + '" loading="lazy">'
          : '<div class="product-finder__product-image product-finder__product-image--placeholder"></div>') +
        '<div class="product-finder__product-info">' +
        '<h3 class="product-finder__product-title">' + product.title + '</h3>' +
        '<p class="product-finder__product-price">' + product.price + '</p>' +
        '</div>' +
        '<span class="product-finder__product-cta">Se produkt →</span>' +
        '</a>';
    });
    html += '</div>';

    resultContainer.innerHTML = html;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
