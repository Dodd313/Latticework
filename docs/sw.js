// 서비스 워커: 인터넷이 될 때는 항상 새 파일을 받고, 끊겼을 때만 보관본을 쓴다.
const CACHE = 'lw-shell-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // 주소 뒤의 꼬리표(?t=, ?v=)는 떼고 보관해 보관본이 쌓이지 않게 한다.
  const key = url.origin + url.pathname;
  event.respondWith(
    // 브라우저의 HTTP 보관본(최대 10분)을 건너뛰고 서버에 바뀐 것이 있는지 매번 확인한다.
    fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || caches.match('./index.html'))),
  );
});

// 알림: 보내는 쪽이 준비되면 그대로 쓴다.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '오늘의 두 건이 준비됐습니다', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/badge-96.png',
      tag: 'lw-daily',
      data: { url: data.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(target);
    }),
  );
});
