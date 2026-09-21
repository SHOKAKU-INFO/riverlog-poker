import { describe, expect, it } from 'vitest'
import { authErrorMessage, detectInAppBrowser } from './browser'

describe('authentication browser guard', () => {
  it('detects LINE without blocking regular Safari', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Line/14.1.0')).toBe('line')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Version/17.0 Mobile/15E148 Safari/604.1')).toBeNull()
  })

  it('turns Firebase failures into actionable messages', () => {
    expect(authErrorMessage({ code: 'auth/unauthorized-domain' })).toContain('ドメイン')
    expect(authErrorMessage({ code: 'auth/popup-blocked' })).toContain('ポップアップ')
  })
})
