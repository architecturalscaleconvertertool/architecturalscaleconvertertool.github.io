// Site chrome shared by every page: the header slides away while reading down and comes back on any scroll up.
// On guides, the contents list marks the section in view; on phones it is a sticky bar that opens the list.
const root = document.documentElement;
const header = document.querySelector('.site-header');
const toc = document.querySelector('[data-toc]');
const details = toc?.querySelector('details');
const current = toc?.querySelector('[data-toc-current]');
const links = toc ? [...toc.querySelectorAll('a[href^="#"]')] : [];
const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
const wide = matchMedia('(min-width: 1100px)');

let lastY = scrollY;
let queued = false;

function update() {
  queued = false;
  const y = scrollY;
  // Hide only after the header has scrolled past, and only on a real move (touch jitter stays put).
  if (Math.abs(y - lastY) > 6) {
    const hide = y > lastY && y > (header?.offsetHeight ?? 60) * 2 && !header?.contains(document.activeElement);
    // On phones an open contents list keeps the header; on desktop the list is always open, so it does not count.
    root.classList.toggle('header-hidden', hide && !(details?.open && !wide.matches));
    lastY = y;
  }
  if (y < 8) root.classList.remove('header-hidden');
  if (heads.length) {
    const line = 140;
    let active = -1;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < line) active = i; });
    links.forEach((a, i) => (i === active ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    if (current) current.textContent = active >= 0 ? links[active].textContent : '';
  }
}

addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
header?.addEventListener('focusin', () => root.classList.remove('header-hidden'));

if (details) {
  const layout = () => { details.open = wide.matches; };
  layout();
  wide.addEventListener('change', layout);
  // Phones: picking a section closes the list so the text is visible again.
  toc.addEventListener('click', (e) => { if (e.target.closest('a') && !wide.matches) details.open = false; });
  // Desktop keeps the list open: the summary is hidden there, so nothing can close it.
}
update();
