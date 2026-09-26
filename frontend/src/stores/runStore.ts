import { create } from 'zustand'
import type { SheetRun, SheetRunInput } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { calculatePulpConsumedKg, formatPulpKg } from '../utils/pulp'
import { calculateDeviation } from '../utils/stripe'

interface RunStore {
  sheetRuns: SheetRun[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadRuns: () => Promise<void>
  addRun: (input: SheetRunInput) => Promise<SheetRun | null>
  updateMeasuredGap: (id: number, measuredGap: number, standardGap: number) => Promise<void>
}

export const useRunStore = create<RunStore>((set, get) => ({
  sheetRuns: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadRuns: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const sheetRuns = await db.sheetRuns.orderBy('runDate').reverse().toArray()
      set({ sheetRuns, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '抄纸工序读取失败，请检查浏览器存储权限' })
    }
  },
  addRun: async (input) => {
    set({ error: null })
    try {
      let created: SheetRun | null = null
      let shortageMessage: string | null = null
      // 同批料被多槽引用时，逐槽往下扣：在同一事务内重算已用量，余量不够整笔回滚，工序不保存。
      await db.transaction('rw', db.sheetRuns, db.fiberBatches, db.moulds, async () => {
        const batch = await db.fiberBatches.get(input.batchId)
        if (!batch) {
          shortageMessage = '所选料批不存在，请重新选择纤维料批。'
          return
        }
        const mould = await db.moulds.get(input.mouldId)
        // 以克重、帘框面积、叠高算出本槽耗浆；表单未带快照时用帘框尺寸兜底重算
        const consumedKg = input.pulpConsumedKg > 0 && input.pulpConsumedKg !== undefined
          ? input.pulpConsumedKg
          : calculatePulpConsumedKg(input.grammage, mould?.frameW ?? 0, mould?.frameH ?? 0, input.stackHeight)
        if (!(consumedKg > 0)) {
          shortageMessage = '本槽耗浆计算为 0，请检查克重、叠高与纸帘帘框尺寸。'
          return
        }
        const referencedRuns = await db.sheetRuns.where('batchId').equals(input.batchId).toArray()
        const usedKg = referencedRuns.reduce((total, run) => total + (run.pulpConsumedKg ?? 0), 0)
        const remainingKg = Math.max(0, Number((batch.pulpAmountKg - usedKg).toFixed(3)))
        if (consumedKg > remainingKg + 1e-9) {
          const deficit = Number((consumedKg - remainingKg).toFixed(3))
          shortageMessage = `浆料余量不足：料批 ${batch.batchNo} 剩余 ${formatPulpKg(remainingKg)}，本槽需浆 ${formatPulpKg(consumedKg)}，还差 ${formatPulpKg(deficit)}。该槽已挡下，工序未保存。`
          return
        }
        const payload = plain({ ...input, pulpConsumedKg: consumedKg })
        const id = Number(await db.sheetRuns.add(payload))
        created = { ...payload, id, schemaRev: 3 }
      })
      if (!created) {
        set({ error: shortageMessage ?? '工序登记失败，请检查工序编号是否重复' })
        return null
      }
      set((state) => ({ sheetRuns: [created as SheetRun, ...state.sheetRuns], error: null }))
      return created
    } catch {
      set({ error: '工序登记失败，请检查工序编号是否重复' })
      return null
    }
  },
  updateMeasuredGap: async (id, measuredGap, standardGap) => {
    const deviation = calculateDeviation(measuredGap, standardGap)
    try {
      await db.sheetRuns.update(id, { measuredGap, deviation, schemaRev: 3 })
      set((state) => ({
        sheetRuns: state.sheetRuns.map((run) => (run.id === id ? { ...run, measuredGap, deviation, schemaRev: 3 } : run)),
        error: null,
      }))
    } catch {
      set({ error: '实测间距更新失败' })
    }
  },
}))
