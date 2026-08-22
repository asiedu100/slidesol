const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const initScrollReveal = () => {
  const items = document.querySelectorAll('[data-reveal]:not(.is-visible)');
  if (!items.length) return;

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  items.forEach((item) => observer.observe(item));
};

const initHeroCarousel = () => {
  const slides = document.querySelectorAll('[data-hero-carousel] .hero-slide');
  if (slides.length < 2 || prefersReducedMotion()) return;

  let active = 0;
  setInterval(() => {
    slides[active].classList.remove('is-active');
    active = (active + 1) % slides.length;
    slides[active].classList.add('is-active');
  }, 5000);
};

initScrollReveal();
initHeroCarousel();
