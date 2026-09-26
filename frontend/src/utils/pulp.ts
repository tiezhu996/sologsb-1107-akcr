import type { SheetRun } from '../types/sheet-run'

/** 单槽耗浆（公斤）= 克重 g/m² × 帘框面积 m² × 叠高张数，帘框尺寸以厘米登记。 */
export function calculatePulpUsageKg(grammage: number, frameW: number, frameH: number, stackHeight: number): number {
  const areaM2 = (frameW / 100) * (frameH / 100)
  return Number(((grammage * areaM2 * stackHeight) / 1000).toFixed(3))
}

/** 按料批汇总各槽已扣耗浆，同一料批被几槽引用就逐槽累加。 */
export function sumPulpUsedByBatch(runs: SheetRun[]): Map<number, number> {
  const usedByBatch = new Map<number, number>()
  for (const run of runs) {
    usedByBatch.set(run.batchId, Number(((usedByBatch.get(run.batchId) ?? 0) + run.pulpUsed).toFixed(3)))
  }
  return usedByBatch
}

/** 料批剩余浆料（公斤），已记工序的扣减不因料批改动而回退，剩余可能略低于零。 */
export function remainingPulpKg(pulpAmount: number, usedKg: number): number {
  return Number((pulpAmount - usedKg).toFixed(3))
}

/** 剩余不足一公斤量级即视为见底，在工序选择中标注。 */
export function isPulpDepleted(remainingKg: number): boolean {
  return remainingKg <= 0
}

export function formatPulpKg(value: number): string {
  return `${Math.max(0, value).toFixed(2)} 公斤`
}
