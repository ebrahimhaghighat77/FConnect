import type { FcApi } from '../../shared/types'

declare global {
  interface Window {
    fc: FcApi
  }
}
