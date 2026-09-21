export type InAppBrowser = 'line' | 'instagram' | 'facebook' | null

export function detectInAppBrowser(userAgent: string): InAppBrowser {
  const ua = userAgent.toLowerCase()
  if (ua.includes(' line/') || ua.includes('; line')) return 'line'
  if (ua.includes('instagram')) return 'instagram'
  if (ua.includes('fban') || ua.includes('fbav')) return 'facebook'
  return null
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code.includes('popup-closed-by-user')) return 'ログインをキャンセルしました。'
  if (code.includes('popup-blocked')) return 'ポップアップがブロックされました。ブラウザの設定を確認してください。'
  if (code.includes('unauthorized-domain')) return 'このドメインはGoogleログインに未登録です。管理者へお知らせください。'
  if (code.includes('network-request-failed')) return '通信に失敗しました。接続を確認して再試行してください。'
  return 'Googleログインに失敗しました。SafariまたはChromeで再試行してください。'
}
