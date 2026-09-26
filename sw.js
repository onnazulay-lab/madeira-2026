/* Madeira 2026 -- the service worker that makes the Home Screen install a real
   offline app rather than a hopefully-still-cached web page.

   The app is one ~8.8 MB file that fetches nothing at runtime, so this is about
   as simple as a service worker gets: take a copy of the six files at install,
   and afterwards answer every request out of that copy. Not "cache first, then
   refresh" -- cache only, and the network solely for a miss. A copy is replaced
   by installing the next one under a new CACHE name and tapping Update, never
   by this worker quietly writing new files into the cache it is serving from.
   On the island there will be no network, and that is the normal case here.

   It does nothing at all when the page is opened as a local file -- service
   workers require a secure origin, and file:// is not one. See README.md. */

/* DO NOT EDIT THIS LINE BY HAND. build.py rewrites it from the same build number
   it stamps into the page, so the two can never disagree.
   It matters more than it looks: an installed copy answers from the cache first,
   so under an unchanged name it can keep serving the index.html it took a
   fortnight ago and never notice the new one. A new name is what makes install
   fetch the new files and activate() delete the old cache outright -- and it was
   a hand-edited line, i.e. one forgotten edit away from shipping nothing at all
   to a phone that would look perfectly up to date. */
var CACHE = "madeira-2026-b151";
var FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png"
];

/* Take a copy of the six files, and then WAIT.
   This used to call skipWaiting() here, which meant a rebuilt app swapped itself
   in on the next launch with nothing said. That is the wrong trade for this app:
   the update can be the hotel that moved or the ferry that now sails an hour
   earlier, and it went in silently, so there was no way to know whether the
   screen in your hand was today's plan or a fortnight-old one. Waiting instead
   lets the page see a new worker sitting there, put up the bar, and let the
   reload be a tap -- see "staying current" in the page.
   On a FIRST install there is no worker controlling anything, so the browser
   activates this one immediately and none of that applies. Waiting only ever
   happens when there is a running copy to interrupt. */
self.addEventListener("install", function (e) {
  /* cache: "reload" so the six files come off the network, not out of the
     browser's HTTP cache. A host serving max-age=600 would otherwise let a
     brand new worker take a copy of the page it replaced, which looks from
     the outside exactly like an update that did nothing. */
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) {
      return new Request(f, { cache: "reload" });
    }));
  }));
});

/* The other half of it: the page asks, and only then does the new worker take
   over. clients.claim() in activate then fires controllerchange on the page,
   which reloads once into the new app. */
self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* Cache-only for this app's own files, and no background revalidation.

   It used to answer from the cache and refresh in the background, which sounds
   harmless and is not. The refresh put() the answer into the CURRENT cache --
   so an installed copy, told there was a new build waiting, quietly filed the
   new index.html under its own old cache name and served it on the next
   launch. Build N+1 on the screen, the update bar still up, nothing tapped.
   That is the one thing the bar promises will not happen.

   Nothing is lost by dropping it. The page fetches nothing at runtime (build.py
   asserts that every build), a new build arrives as a new CACHE name, and the
   page already calls registration.update() at launch and on foreground. The
   network is only for a miss.

   ignoreSearch on the lookup, and no put() at all, also ends the other half of
   it: put() keys on the full URL, so /?utm=1 and /?utm=2 each stored another
   8.7 MB copy of the app on the phone. */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  // Map and booking links are things you tap on purpose and they are allowed to
  // need signal. Only this app's own files are served from the cache.
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
        // cache first: offline is the normal case, not the error case
        return hit || fetch(e.request);
      });
    })
  );
});
