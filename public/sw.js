/* global self, clients */

// Minimal Service Worker to enable Web Push.
// If you later switch back to next-pwa/Workbox generation, this file may be replaced.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Push handlers live in a separate file for readability.
// This keeps /sw.js stable and easy to debug.
try {
  importScripts('/push-sw.js')
} catch (e) {
  // If this fails, push still won't work; but at least /sw.js loads.
  // (No console available here on iOS; use desktop devtools to debug.)
}
