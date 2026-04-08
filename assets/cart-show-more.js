(function() {
  var PAGE_SIZE = 10; // 2 rows of 5
  var ANIM_DURATION = 350; // ms

  function init() {
    var sections = document.querySelectorAll('.shopify-section');
    var productSection = null;

    for (var i = 0; i < sections.length; i++) {
      if (sections[i].id && sections[i].id.indexOf('product_list') !== -1) {
        productSection = sections[i];
        break;
      }
    }

    if (!productSection) return;

    // Find grid container
    var grid = productSection.querySelector('ul[role="list"], ol[role="list"], ul.grid, .product-list-grid');
    if (!grid) {
      var candidates = productSection.querySelectorAll('ul, ol, [class*="grid"]');
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].children.length >= PAGE_SIZE) {
          grid = candidates[j];
          break;
        }
      }
    }

    if (!grid) return;

    // Set up grid for animations
    grid.style.position = 'relative';
    grid.style.overflow = 'hidden';

    var items = Array.prototype.slice.call(grid.children);
    var totalPages = Math.ceil(items.length / PAGE_SIZE);

    if (totalPages <= 1) return;

    var currentPage = 0;
    var animating = false;

    // Set transition on all items
    for (var i = 0; i < items.length; i++) {
      items[i].style.transition = 'opacity ' + ANIM_DURATION + 'ms ease, transform ' + ANIM_DURATION + 'ms ease';
    }

    function showPage(page, direction) {
      if (animating || page === currentPage) return;
      animating = true;

      var start = page * PAGE_SIZE;
      var end = start + PAGE_SIZE;
      var slideOut = direction === 'next' ? -30 : 30;
      var slideIn = direction === 'next' ? 30 : -30;

      // Fade + slide out current items
      for (var i = 0; i < items.length; i++) {
        if (items[i].style.display !== 'none') {
          items[i].style.opacity = '0';
          items[i].style.transform = 'translateX(' + slideOut + 'px)';
        }
      }

      setTimeout(function() {
        // Hide old, show new (starting off-screen)
        for (var i = 0; i < items.length; i++) {
          if (i >= start && i < end) {
            items[i].style.display = '';
            items[i].style.transition = 'none';
            items[i].style.opacity = '0';
            items[i].style.transform = 'translateX(' + slideIn + 'px)';
          } else {
            items[i].style.display = 'none';
          }
        }

        // Force reflow
        grid.offsetHeight;

        // Animate in
        for (var i = start; i < end && i < items.length; i++) {
          items[i].style.transition = 'opacity ' + ANIM_DURATION + 'ms ease, transform ' + ANIM_DURATION + 'ms ease';
          items[i].style.opacity = '1';
          items[i].style.transform = 'translateX(0)';
        }

        currentPage = page;
        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = currentPage === totalPages - 1;
        prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
        nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
        pageInfo.textContent = (currentPage + 1) + ' / ' + totalPages;

        setTimeout(function() {
          animating = false;
        }, ANIM_DURATION);
      }, ANIM_DURATION);
    }

    // Initial state — show first page without animation
    function showInitial() {
      for (var i = 0; i < items.length; i++) {
        if (i < PAGE_SIZE) {
          items[i].style.display = '';
          items[i].style.opacity = '1';
          items[i].style.transform = 'translateX(0)';
        } else {
          items[i].style.display = 'none';
        }
      }
    }

    // Create navigation
    var nav = document.createElement('div');
    nav.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 28px; margin-bottom: 24px;';

    var btnStyle = [
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'width: 40px',
      'height: 40px',
      'font-size: 1.2rem',
      'border: 1px solid rgba(0,0,0,0.15)',
      'border-radius: 50%',
      'cursor: pointer',
      'background: transparent',
      'color: inherit',
      'transition: border-color 0.2s ease, opacity 0.2s ease'
    ].join(';');

    var prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&#8592;';
    prevBtn.style.cssText = btnStyle;
    prevBtn.addEventListener('click', function() {
      if (currentPage > 0) showPage(currentPage - 1, 'prev');
    });

    var nextBtn = document.createElement('button');
    nextBtn.innerHTML = '&#8594;';
    nextBtn.style.cssText = btnStyle;
    nextBtn.addEventListener('click', function() {
      if (currentPage < totalPages - 1) showPage(currentPage + 1, 'next');
    });

    var pageInfo = document.createElement('span');
    pageInfo.style.cssText = 'font-size: 0.85rem; opacity: 0.5; min-width: 40px; text-align: center;';

    nav.appendChild(prevBtn);
    nav.appendChild(pageInfo);
    nav.appendChild(nextBtn);

    var insertTarget = grid.closest('[class*="product-list"]') || grid.parentNode;
    insertTarget.appendChild(nav);

    // Init
    showInitial();
    prevBtn.disabled = true;
    prevBtn.style.opacity = '0.3';
    nextBtn.disabled = totalPages <= 1;
    nextBtn.style.opacity = totalPages <= 1 ? '0.3' : '1';
    pageInfo.textContent = '1 / ' + totalPages;
  }

  window.addEventListener('load', init);
})();
