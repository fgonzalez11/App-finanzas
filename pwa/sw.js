/* Service worker mínimo: guarda la app para que abra sin señal.
   Nunca cachea la API — los datos siempre salen de la planilla. */
var CACHE = 'gastos-v6';

/* OJO con esta lista. En GitHub Pages la app es UN SOLO archivo: resumen.js va
   incrustado adentro de index.html y NO existe suelto. Mientras estuvo pedido
   acá, addAll() se caía con el 404 y arrastraba a toda la instalación: el
   service worker nuevo nunca llegaba a activarse y el teléfono se quedaba con
   la versión vieja pegada. Por eso ahora va uno por uno y un archivo que falte
   no voltea al resto. */
var SHELL = ['./', './index.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { });   // que falte uno no cancela la instalación
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Todo lo que vaya a Apps Script pasa derecho a la red
  if (url.hostname.indexOf('script.google') >= 0 ||
      url.hostname.indexOf('googleusercontent') >= 0) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then(function (r) {
      var copia = r.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
      return r;
    }).catch(function () {
      return caches.match(e.request).then(function (r) {
        if (r) return r;
        // Solo la navegación cae de vuelta en index.html. Para un script o una
        // imagen sería peor el remedio: devolverle HTML a un <script> lo hace
        // reventar con "Unexpected token '<'" en vez de dar un error claro.
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
