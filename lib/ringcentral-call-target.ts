/** Browser-only call handoff helpers. These functions never initiate a call. */
export type CallPlatform = 'mac' | 'ios' | 'android' | 'desktop'
export type BrowserDevice = { userAgent?: string; platform?: string; maxTouchPoints?: number }

export function getCallPlatform(device: BrowserDevice): CallPlatform {
  const ua = device.userAgent || ''
  const platform = device.platform || ''
  // iPadOS can identify itself as a Mac. Detect it before desktop macOS.
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

export function requiresAppleCallingSetup(platform: CallPlatform): boolean {
  return platform === 'mac' || platform === 'ios'
}

export function ringCentralCallHref(phone: string, platform: CallPlatform): string {
  const number = toRingCentralNumber(phone)
  if (!number) return ''
  // Apple routes tel: to the registered default calling app. The shared UI
  // requires explicit confirmation of RingCentral as that default first.
  // No guessed app scheme, web fallback, window.open, or automatic retry.
  if (requiresAppleCallingSetup(platform)) return `tel:+${number}`
  const encoded = encodeURIComponent(number)
  return platform === 'android'
    ? `rcmobile://call?number=${encoded}`
    : `rcapp://r/call?number=${encoded}`
}
