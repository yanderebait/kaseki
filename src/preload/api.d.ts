import type { KasekiApi } from './index'

declare global {
  interface Window {
    kaseki: KasekiApi
  }
}

export {}
