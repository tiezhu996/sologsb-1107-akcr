import { create } from 'zustand'
import type { SheetRun, SheetRunInput } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { remainingPulpKg } from '../utils/pulp'
import { calculateDeviation } from '../utils/stripe'
import { useFiberStore } from './fiberStore'

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
    const batch = useFiberStore.getState().fiberBatches.find((item) => item.id === input.batchId)
    if (batch) {
      const usedKg = get().sheetRuns
        .filter((run) => run.batchId === input.batchId)
        .reduce((sum, run) => sum + run.pulpUsed, 0)
      const remainingKg = remainingPulpKg(batch.pulpAmount, usedKg)
      if (input.pulpUsed > remainingKg) {
        const shortKg = Number((input.pulpUsed - remainingKg).toFixed(3))
        set({
          error: `料批 ${batch.batchNo} 余浆不足，本槽需 ${input.pulpUsed.toFixed(2)} 公斤，仅剩 ${Math.max(0, remainingKg).toFixed(2)} 公斤，还差 ${shortKg.toFixed(2)} 公斤，工序未保存`,
        })
        return null
      }
    }
    try {
      const payload = plain(input)
      const id = Number(await db.sheetRuns.add(payload))
      const created: SheetRun = { ...payload, id, schemaRev: 3 }
      set((state) => ({ sheetRuns: [created, ...state.sheetRuns] }))
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
