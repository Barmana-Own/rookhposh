(() => {
  const root = document.getElementById('root'), boot = document.getElementById('rookhposh-boot');
  if (!root || !boot) return;
  const message = boot.querySelector('[data-boot-message]');
  const warn = () => {
    if (!boot.isConnected) return;
    message.textContent = navigator.onLine === false ? 'اتصال اینترنت قطع است. پس از اتصال، صفحه را دوباره بارگذاری کنید.' : 'بارگذاری برنامه هنوز کامل نشده است؛ اتصال را بررسی کنید یا صفحه را دوباره بارگذاری کنید.';
    boot.setAttribute('role', 'alert');
  };
  const failed = event => { if (event.target instanceof HTMLScriptElement && event.target.type === 'module') warn(); };
  const timer = setTimeout(warn, 20000);
  window.addEventListener('offline', warn); window.addEventListener('error', failed, true);
  const observer = new MutationObserver(() => {
    if (boot.isConnected) return;
    clearTimeout(timer); window.removeEventListener('offline', warn); window.removeEventListener('error', failed, true); observer.disconnect();
  });
  observer.observe(root, { childList: true });
})();
