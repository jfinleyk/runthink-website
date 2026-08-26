/* RunThink cookie-consent banner for Google Analytics.
 *
 * The gtag snippet in each page's <head> defaults analytics_storage to
 * "denied" (Consent Mode v2) and re-applies a stored "granted" choice on load.
 * This script handles the interactive part: it shows a banner to visitors who
 * have not chosen yet, and on Accept flips consent to granted for this and
 * future visits. Declining leaves GA in its cookieless default. */
(function () {
  var KEY = 'rt-analytics-consent';

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}

  // Already answered. A stored "granted" was applied by the head script; a
  // stored "denied" needs nothing. Either way, no banner.
  if (choice === 'granted' || choice === 'denied') return;

  var banner = null;

  function save(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
  }

  function dismiss() {
    if (!banner) return;
    banner.setAttribute('data-leaving', '');
    setTimeout(function () {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      banner = null;
    }, 260);
  }

  function accept() {
    save('granted');
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
    }
    dismiss();
  }

  function decline() {
    save('denied');
    dismiss();
  }

  function build() {
    var style = document.createElement('style');
    style.textContent = [
      '.rt-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;',
        'max-width:560px;margin:0 auto;background:#0f1c12;color:#eef3ec;',
        'border:1px solid rgba(143,196,135,.35);border-radius:16px;padding:18px 20px;',
        "font-family:'Instrument Sans',system-ui,sans-serif;",
        'box-shadow:0 12px 40px rgba(0,0,0,.45);',
        'transform:translateY(0);opacity:1;transition:transform .26s ease,opacity .26s ease}',
      '.rt-consent[data-leaving]{transform:translateY(12px);opacity:0}',
      '.rt-consent p{margin:0 0 14px;font:400 14.5px/1.55 inherit;color:rgba(238,243,236,.82)}',
      '.rt-consent a{color:#8fc487;text-decoration:underline}',
      '.rt-consent-row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}',
      '.rt-consent button{font:600 14px inherit;border-radius:999px;padding:11px 22px;',
        'cursor:pointer;border:1px solid transparent}',
      '.rt-consent .rt-decline{background:transparent;color:#eef3ec;border-color:rgba(238,243,236,.28)}',
      '.rt-consent .rt-decline:hover{border-color:rgba(238,243,236,.55)}',
      '.rt-consent .rt-accept{background:#5a9957;color:#0d1a10}',
      '.rt-consent .rt-accept:hover{background:#8fc487}',
      '@media (max-width:420px){.rt-consent-row{justify-content:stretch}.rt-consent button{flex:1}}',
      '@media (prefers-reduced-motion:reduce){.rt-consent{transition:none}}'
    ].join('');
    document.head.appendChild(style);

    banner = document.createElement('div');
    banner.className = 'rt-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Analytics consent');
    banner.innerHTML =
      '<p>We use Google Analytics to see how visitors find and use RunThink, so we can ' +
      'make it better. It sets cookies only if you accept. See our ' +
      '<a href="/privacy">Privacy Policy</a>.</p>' +
      '<div class="rt-consent-row">' +
        '<button type="button" class="rt-decline">Decline</button>' +
        '<button type="button" class="rt-accept">Accept</button>' +
      '</div>';

    banner.querySelector('.rt-accept').addEventListener('click', accept);
    banner.querySelector('.rt-decline').addEventListener('click', decline);
    document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
