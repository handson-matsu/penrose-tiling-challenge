// Shared GAS counter: same endpoint/options as coin-shooting and pencil-factory.
// Independent of app.js: never wait for a response or subscribe to app events.
(() => {
  if (window.penroseTilingAccessRecorded) return;
  window.penroseTilingAccessRecorded = true;
  try {
    fetch('https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec?app=penrose-tiling-challenge', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Missing fetch or synchronous failures must not interrupt the app. No retry.
  }
})();
