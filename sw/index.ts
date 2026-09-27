/// <reference lib="webworker" />
/**
 * Service worker entry. Bundled by Bun into public/sw.js (`bun run sw:build`,
 * run automatically by `dev` and `build`).
 */
declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

export {};
