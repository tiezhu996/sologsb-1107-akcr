import type { SheetRun } from '../types/sheet-run'

/**
 * 单槽耗浆（kg）= 克重(g/m²) × 帘框面积(m²) × 叠高(张) ÷ 1000
 * 帘框尺寸单位为 cm，面积 = frameW × frameH ÷ 10000
 */
export function calculatePulpConsumedKg(grammage: number, frameW: number, frameH: number, stackHeight: number): number {
  if (!(grammage > 0) || !(frameW > 0) || !(frameH > 0) || !(stackHeight > 0)) return 0
  const areaM2 = (frameW * frameH) / 10000
  return Number(((grammage * areaM2 * stackHeight) / 1000).toFixed(3))
}

/** 同一料批被多槽引用时，逐槽累加耗浆快照 */
export function sumUsedPulpKg(runs: Pick<SheetRun, 'pulpConsumedKg'>[]): number {
  return Number(runs.reduce((total, run) => total + (run.pulpConsumedKg ?? 0), 0).toFixed(3))
}

export function isPulpDepleted(remainingKg: number): boolean {
  return remainingKg <= 1e-9
}

export function formatPulpKg(value: number): string {
  return `${value.toFixed(2)} kg`
}
