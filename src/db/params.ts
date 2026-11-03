import { DEFAULT_W, isValidWeights, makeParams } from '../lib/fsrs'
import type { AppSettings } from '../types'

/** Parameter penjadwal dari pengaturan (parameter pribadi bila valid). */
export function paramsFromSettings(s: AppSettings) {
  return makeParams({
    w: isValidWeights(s.fsrsParams) ? s.fsrsParams : DEFAULT_W,
    desiredRetention: s.desiredRetention,
    maxInterval: s.maxInterval,
  })
}
