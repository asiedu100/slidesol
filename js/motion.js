export const initHeroReveal = () => {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  // Double rAF ensures the initial (hidden) state paints first, so the
  // CSS transitions triggered by adding this class actually animate.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hero.classList.add('is-revealed');
    });
  });
};

export const initScrollReveal = () => {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  targets.forEach((el) => observer.observe(el));
};

export const initFilterPanel = () => {
  const panel = document.querySelector('[data-filter-panel]');
  const trigger = document.querySelector('[data-filters-trigger]');
  const closeButton = document.querySelector('[data-filter-panel-close]');
  const backdrop = document.querySelector('[data-filter-panel-backdrop]');
  if (!panel || !trigger) return;

  const open = () => panel.classList.add('is-open');
  const close = () => panel.classList.remove('is-open');

  trigger.addEventListener('click', open);
  closeButton?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  return { close };
};

export const initMobileNav = () => {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-mobile-nav]');
  const closeButton = document.querySelector('[data-mobile-nav-close]');
  if (!toggle || !nav) return;

  const open = () => {
    nav.classList.add('is-open');
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    nav.classList.remove('is-open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  toggle.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) close(); else open();
  });
  closeButton?.addEventListener('click', close);
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
};

export const initHeaderScrollState = () => {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const THRESHOLD = 40;
  let ticking = false;

  const update = () => {
    header.classList.toggle('is-solid', window.scrollY > THRESHOLD);
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  update();
};
