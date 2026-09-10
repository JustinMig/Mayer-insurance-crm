/** Build a call link only. Navigation happens when the user clicks Call. */
export type CallPlatform = 'mac' | 'ios' | 'android' | 'desktop'
export type BrowserDevice = { userAgent?: string; platform?: string; maxTouchPoints?: number }

export function getCallPlatform(device: BrowserDevice): CallPlatform {
  const ua = device.userAgent || ''
  const platform = device.platform || ''
  if (/iPad|iPhone|iPod/i.test(ua) || (/^Mac/i.test(platform) && (device.maxTouchPoints || 0) > 1)) return 'ios'
  if (/Macintosh|Mac OS X/i.test(ua) || /^Mac/i.test(platform)) return 'mac'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function toRingCentralNumber(value: string): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  return digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0') ? digits : ''
}

/** Kept for compatibility; there is no setup gate in the CRM. */
export function requiresAppleCallingSetup(_platform: CallPlatform): boolean {
  return false
}

export function ringCentralCallHref(phone: string, platform?: CallPlatform): string {
  const number = toRingCentralNumber(phone)
  if (!number) return ''

  // macOS Safari always understands the standard tel: scheme. RingCentral's
  // desktop app can register itself as the click-to-dial handler for tel links,
  // so the OS can hand the number directly to the installed RingCentral app.
  // This avoids Safari trying to parse an unregistered custom URI scheme.
  if (platform === 'mac') {
    return `tel:+${number}`
  }

  // Preserve the existing behavior on every non-macOS platform.
  return `https://app.ringcentral.com/r/call?number=${encodeURIComponent(number)}`
}
