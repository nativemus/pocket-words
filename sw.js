// Офлайн и скорость: всё открывается из памяти телефона сразу, свежая версия скачивается в фоне.
// Когда новая версия поставилась, приложение само перезагрузится (если ты ещё не начал работу) или скажет «обновление готово».
const CACHE = 'strokes-v2.0';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'engine.js', 'senses.js', 'endings.js', 'punch.js', 'hum.js', 'beat.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('huggingface.co') || u.hostname.endsWith('hf.co')) return; // модели кэширует сама библиотека
  const sameOrigin = u.origin === self.location.origin;
  if (!sameOrigin && !u.hostname.endsWith('jsdelivr.net')) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: sameOrigin });
    const net = (sameOrigin ? fetch(u.href, { cache:'no-cache' }) : fetch(e.request)).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;   // из памяти — сразу; сеть только обновляет память
  }));
});
