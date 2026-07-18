// Cross-device push notifications via OneSignal (the page SDK). OneSignal owns
// VAPID/encryption/iOS delivery; our Apps Script backend triggers a send on a
// real-time egg add (see apps-script/Code.js `notify_`). This module is the
// client half: load + init the SDK, the opt-in flow, and the fire-and-forget
// "notify the others" POST.
//
// Everything no-ops while ONESIGNAL_APP_ID is blank, so the app is unaffected
// until the OneSignal account is wired up.
import { ONESIGNAL_APP_ID } from './config.js'
import { endpoint } from './sync.js'
import { uid } from './storage.js'

const DEVICE_KEY = 'eggo-device-id'

// A stable per-device id, generated once. We tag the OneSignal subscription with
// it so the logging device can be excluded from its own notification (sender).
export function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = uid()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

// True only where push can actually work: a OneSignal app is configured, the
// browser has SW + Notifications, and we're in a secure context (push won't
// register on the plain-HTTP LAN dev URL).
export function pushSupported() {
  return Boolean(ONESIGNAL_APP_ID) &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    window.isSecureContext
}

// Running as an installed (standalone) PWA?
export function isInstalled() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone,
  )
}

// iOS/iPadOS is the one platform that ONLY delivers Web Push to an installed
// PWA — desktop Chrome/Edge/Firefox and Android Chrome push from a normal tab.
// (iPadOS 13+ reports as "MacIntel" but has touch points.)
function isIOS() {
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Synchronous snapshot for the opt-in UI. `enabled` uses the browser permission
// as a good-enough proxy for "subscribed" (our enable flow grants both together).
// `needsInstall` is the iOS-only case where the user must add to home screen
// before push can work at all.
export function notificationsState() {
  const supported = pushSupported()
  const permission = 'Notification' in window ? Notification.permission : 'default'
  return {
    supported,
    installed: isInstalled(),
    enabled: supported && permission === 'granted',
    denied: supported && permission === 'denied',
    needsInstall: supported && isIOS() && !isInstalled(),
  }
}

// Run a fn once the OneSignal SDK is ready (its deferred-init queue).
function withOneSignal(fn) {
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(fn)
}

let loaded = false
// Load + init the OneSignal page SDK once, reusing OUR service worker (sw.js)
// rather than letting OneSignal register a second one. No-op without an app id.
export function loadOneSignal() {
  if (loaded || !pushSupported()) return
  loaded = true
  withOneSignal(async (OneSignal) => {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      // Point OneSignal at our SW (which importScripts its worker). Paths are
      // relative to the site root; the app lives under /eggo/.
      serviceWorkerParam: { scope: '/eggo/' },
      serviceWorkerPath: 'eggo/sw.js',
    })
    // Re-assert the device tag if already subscribed (e.g. after a reinstall),
    // so sender-exclusion keeps working.
    if (OneSignal.Notifications.permission) {
      OneSignal.User.addTag('device', deviceId())
    }
  })
  const s = document.createElement('script')
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
  s.defer = true
  document.head.appendChild(s)
}

// Run `job(OneSignal)` once the SDK is ready, but never hang forever waiting for
// it. If the SDK doesn't initialize within the timeout — the usual cause being
// that OneSignal isn't configured for this site's domain (e.g. after a domain
// change), so `init()` never completes and the deferred queue never drains — we
// resolve `false` instead of leaving the caller (and its "Enabling…" button)
// stuck. Once the job starts we let it run to completion (a permission prompt can
// legitimately take a while), so the timeout only guards "SDK never became ready".
function runWhenReady(job) {
  return new Promise((resolve) => {
    if (!pushSupported()) return resolve(false)
    let settled = false
    const done = (v) => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    const timer = setTimeout(() => done(false), 8000)
    withOneSignal(async (OneSignal) => {
      if (settled) return // already timed out; don't run late (or re-prompt)
      clearTimeout(timer)
      try {
        done(await job(OneSignal))
      } catch {
        done(false)
      }
    })
  })
}

// Prompt + subscribe, then tag this device so it can be excluded as the sender.
// Resolves to whether notifications ended up enabled (false if the SDK never
// became ready — see runWhenReady).
export function enableNotifications() {
  return runWhenReady(async (OneSignal) => {
    await OneSignal.Notifications.requestPermission()
    if (OneSignal.Notifications.permission) {
      await OneSignal.User.PushSubscription.optIn()
      OneSignal.User.addTag('device', deviceId())
    }
    return Boolean(OneSignal.Notifications.permission)
  })
}

// --- Manual subscription controls, surfaced by long-pressing the alerts button.
// A web push subscription can silently go stale (iOS especially — Apple drops
// them), and once the browser permission is 'granted' the Enable button treats
// you as done, so there's otherwise no way to force a fresh subscription. These
// give one: unsubscribe, and a resubscribe that forces a clean re-opt-in. ---

// Drop this device's push subscription. Best-effort; resolves to whether it ran.
export function unsubscribeNotifications() {
  return runWhenReady(async (OneSignal) => {
    await OneSignal.User.PushSubscription.optOut()
    return true
  })
}

// Force a fresh subscription: opt out, then back in, then re-assert the device
// tag. The opt-out first fixes the stale case where a lone opt-in would no-op
// because OneSignal still thinks this device is subscribed. Resolves to enabled.
export function resubscribeNotifications() {
  return runWhenReady(async (OneSignal) => {
    await OneSignal.Notifications.requestPermission()
    if (OneSignal.Notifications.permission) {
      try {
        await OneSignal.User.PushSubscription.optOut()
      } catch {
        /* may already be out — keep going */
      }
      await OneSignal.User.PushSubscription.optIn()
      OneSignal.User.addTag('device', deviceId())
    }
    return Boolean(OneSignal.Notifications.permission)
  })
}

// Fire a notification to THIS device only, so you can check alerts display here.
// It's a LOCAL notification shown via our own service worker — it verifies the
// permission + SW + display path on this device without going through the push
// server, so it works (and isolates "does anything show up?") even when the push
// subscription is dead. End-to-end cross-device delivery is instead exercised by
// logging an egg on another device. Resolves to { ok, reason }.
export async function sendTestNotification() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (Notification.permission !== 'granted') return { ok: false, reason: 'permission' }
  try {
    const reg = await navigator.serviceWorker.ready
    const icon = `${import.meta.env.BASE_URL}icon-192.png`
    await reg.showNotification('Eggo', {
      body: '🥚 Test alert — notifications work on this device.',
      icon,
      badge: icon,
      tag: 'eggo-test',
    })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

// Best-effort "a new egg was logged" push to the OTHER devices. Fired ONLY from
// the live save path — never imports, backlog, undo/delete, or sync — so it can't
// fan out a stale flood. Failures are swallowed; the egg still syncs normally.
// The backend only actually sends when its OneSignal Script Property is set
// (prod), so the debug backend stays silent.
export function notifyNewEgg(entry) {
  if (!ONESIGNAL_APP_ID || !endpoint()) return
  try {
    fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'notify',
        deviceId: deviceId(),
        color: entry?.color ?? null,
        chicken: entry?.chicken ?? null,
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* best-effort */
  }
}
