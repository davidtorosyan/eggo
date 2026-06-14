// Custom service worker (vite-plugin-pwa injectManifest). Two jobs:
//
//  1. Offline app shell — precache the build output Workbox injects below.
//  2. Web Push — importScripts OneSignal's worker, which provides the `push`
//     and `notificationclick` handlers (display + open-on-tap) for us. This is
//     OneSignal's documented "integrate with an existing service worker" path,
//     so there's one SW at one scope instead of two fighting over it.
//
// Classic worker (no `type: module`) so importScripts is available.
import { precacheAndRoute } from 'workbox-precaching'

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')

precacheAndRoute(self.__WB_MANIFEST)
