(function () {
  const COLLECTION_MAP = {
    'wall-indoor': 'indoor-wall',
    'wall-outdoor': 'outdoor-wall',
    'ceiling-indoor': 'ceiling',
    'ceiling-outdoor': 'ceiling',
    'floor-indoor': 'indoor-floor',
    'floor-outdoor': 'outdoor-floor',
  };

  const selectors = {
    form: '#paint-configurator-form',
    surface: '#configurator-surface',
    environment: '#configurator-environment',
    submit: '#configurator-submit',
    selectedColor: '#configurator-selected-color',
    colorPreview: '#configurator-color-preview',
    colorName: '#configurator-color-name',
    noColor: '#configurator-no-color',
    changeColor: '#configurator-change-color',
  };

  let selectedColorHandle = null;
  let selectedColorName = null;
  let selectedColorHex = null;

  function init() {
    const form = document.querySelector(selectors.form);
    if (!form) return;

    readColorFromURL();
    bindSwatchClicks();
    bindFormEvents();
  }

  function readColorFromURL() {
    const params = new URLSearchParams(window.location.search);
    const colorHandle = params.get('color');
    const colorName = params.get('color_name');
    const colorHex = params.get('color_hex');

    if (colorHandle) {
      selectedColorHandle = colorHandle;
      selectedColorName = colorName || colorHandle;
      selectedColorHex = colorHex || null;
      showSelectedColor();
    }
  }

  function bindSwatchClicks() {
    document.addEventListener('click', function (e) {
      const swatch = e.target.closest('.kmeconsulting-color-swatch');
      if (!swatch) return;

      e.preventDefault();

      selectedColorHandle = swatch.dataset.colorHandle;
      selectedColorName = swatch.dataset.colorName;
      selectedColorHex = swatch.dataset.colorHex;

      // Update URL without reload
      const url = new URL(window.location.href);
      url.searchParams.set('color', selectedColorHandle);
      url.searchParams.set('color_name', selectedColorName);
      if (selectedColorHex) {
        url.searchParams.set('color_hex', selectedColorHex);
      }
      history.replaceState({}, '', url.toString());

      // Mark selected swatch
      document.querySelectorAll('.kmeconsulting-color-swatch').forEach(function (s) {
        s.classList.remove('kmeconsulting-color-swatch--selected');
      });
      swatch.classList.add('kmeconsulting-color-swatch--selected');

      showSelectedColor();
      scrollToConfigurator(swatch);
      updateSubmitState();
    });
  }

  function showSelectedColor() {
    const selectedColorEl = document.querySelector(selectors.selectedColor);
    const colorPreview = document.querySelector(selectors.colorPreview);
    const colorNameEl = document.querySelector(selectors.colorName);
    const noColor = document.querySelector(selectors.noColor);

    if (!selectedColorEl) return;

    if (selectedColorHex) {
      colorPreview.style.backgroundColor = selectedColorHex;
    }
    colorNameEl.textContent = selectedColorName;
    selectedColorEl.hidden = false;

    if (noColor) {
      noColor.hidden = true;
    }

    // Mark the matching swatch as selected
    document.querySelectorAll('.kmeconsulting-color-swatch').forEach(function (s) {
      if (s.dataset.colorHandle === selectedColorHandle) {
        s.classList.add('kmeconsulting-color-swatch--selected');
      }
    });

    updateSubmitState();
  }

  function scrollToConfigurator(swatch) {
    const configuratorSectionId = swatch.dataset.configuratorSection;
    let target;

    if (configuratorSectionId) {
      target = document.getElementById(configuratorSectionId);
    } else {
      target = document.getElementById('paint-configurator');
    }

    if (target) {
      const headerOffset = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sticky-header-offset') || '0',
        10
      );
      const top = target.getBoundingClientRect().top + window.scrollY - headerOffset - 20;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  function bindFormEvents() {
    const form = document.querySelector(selectors.form);
    const surface = document.querySelector(selectors.surface);
    const environment = document.querySelector(selectors.environment);
    const changeColor = document.querySelector(selectors.changeColor);

    if (surface) {
      surface.addEventListener('change', updateSubmitState);
    }
    if (environment) {
      environment.addEventListener('change', updateSubmitState);
    }

    if (form) {
      form.addEventListener('submit', handleSubmit);
    }

    if (changeColor) {
      changeColor.addEventListener('click', function () {
        var gridSection = document.querySelector('.kmeconsulting-color-grid');
        if (gridSection) {
          gridSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  function updateSubmitState() {
    const submit = document.querySelector(selectors.submit);
    const surface = document.querySelector(selectors.surface);
    const environment = document.querySelector(selectors.environment);

    if (!submit || !surface || !environment) return;

    const hasColor = selectedColorHandle !== null;
    const hasSurface = surface.value !== '';
    const hasEnvironment = environment.value !== '';

    submit.disabled = !(hasColor && hasSurface && hasEnvironment);
  }

  function handleSubmit(e) {
    e.preventDefault();

    const surface = document.querySelector(selectors.surface);
    const environment = document.querySelector(selectors.environment);

    if (!surface || !environment || !selectedColorHandle) return;

    const key = surface.value + '-' + environment.value;
    const collectionHandle = COLLECTION_MAP[key];

    if (!collectionHandle) {
      console.warn('No collection mapping found for:', key);
      return;
    }

    const url = new URL(window.location.origin + '/collections/' + collectionHandle);
    url.searchParams.set('color', selectedColorHandle);
    if (selectedColorName) {
      url.searchParams.set('color_name', selectedColorName);
    }

    window.location.href = url.toString();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
