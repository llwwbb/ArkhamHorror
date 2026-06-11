import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref, shallowRef, nextTick } from 'vue'
import { useGameUndo, type UseGameUndoOptions } from './useGameUndo'
import * as api from '@/arkham/api'
import type * as Arkham from '@/arkham/types/Game'

vi.mock('@/arkham/api', () => ({
  undoChoice: vi.fn(),
  undoScenarioChoice: vi.fn(),
  undoAction: vi.fn(),
  undoTurn: vi.fn(),
  undoPhase: vi.fn(),
  undoRound: vi.fn(),
}))

function makeGame(over: Partial<Record<string, unknown>> = {}) {
  return {
    question: { p1: { tag: 'ChooseOne' } },
    scenarioSteps: 5,
    undoActionStep: 3,
    undoTurnStep: null,
    undoPhaseStep: 6,
    undoRoundStep: 1,
    ...over,
  } as unknown as Arkham.Game
}

function setup(gameOver: Partial<Record<string, unknown>> = {}) {
  const game = shallowRef<Arkham.Game | null>(makeGame(gameOver))
  const calls: string[] = []
  const opts: UseGameUndoOptions = {
    gameId: () => 'g1',
    game,
    processing: ref(false),
    setGameQuestion: vi.fn(() => calls.push('setGameQuestion')),
    clearResultQueue: vi.fn(() => calls.push('clearResultQueue')),
    modals: { resetForUndo: vi.fn(() => calls.push('resetForUndo')) },
    debugActive: () => false,
  }
  return { undoApi: useGameUndo(opts), opts, game, calls }
}

describe('useGameUndo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('undo 成功：重置顺序为 清问题→清队列→resetForUndo，调用 undoChoice 并释放锁', async () => {
    vi.mocked(api.undoChoice).mockResolvedValue(undefined)
    const { undoApi, opts, calls } = setup()
    await undoApi.undo()
    expect(calls).toEqual(['setGameQuestion', 'clearResultQueue', 'resetForUndo'])
    expect(vi.mocked(opts.setGameQuestion).mock.calls[0][0]).toEqual({})
    expect(api.undoChoice).toHaveBeenCalledWith('g1', false)
    expect(opts.processing.value).toBe(true) // 成功路径 processing 不回 false：由后续 socket GameUpdate 推送解除——正常设计而非怪癖
    // 锁已释放：可再次 undo
    await undoApi.undo()
    expect(api.undoChoice).toHaveBeenCalledTimes(2)
  })

  it('undo 失败：恢复旧 question、processing 回 false', async () => {
    vi.mocked(api.undoChoice).mockRejectedValue(new Error('boom'))
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { undoApi, opts } = setup()
    await undoApi.undo()
    expect(opts.processing.value).toBe(false)
    // 第二次 setGameQuestion 调用恢复了旧 question
    expect(vi.mocked(opts.setGameQuestion).mock.calls[1][0]).toEqual({ p1: { tag: 'ChooseOne' } })
    consoleSpy.mockRestore()
  })

  it('undo 锁早退：pending 期间重入不重复调 API，也不触发重置副作用', async () => {
    let release!: () => void
    vi.mocked(api.undoChoice).mockReturnValue(new Promise<void>((r) => (release = r)))
    const { undoApi, calls } = setup()
    const first = undoApi.undo()
    // 锁在所有副作用之前检查：重入直接返回，不再清 question/队列
    await undoApi.undo()
    expect(api.undoChoice).toHaveBeenCalledTimes(1)
    expect(calls.filter((c) => c === 'setGameQuestion')).toHaveLength(1)
    release()
    await first
  })

  it('undoScenario：持锁 + 失败时恢复旧 question、processing 回 false', async () => {
    let release!: () => void
    vi.mocked(api.undoScenarioChoice).mockReturnValue(new Promise<void>((r) => (release = r)))
    const { undoApi, opts } = setup()
    const first = undoApi.undoScenario()
    // pending 期间重入被锁挡住
    await undoApi.undoScenario()
    expect(api.undoScenarioChoice).toHaveBeenCalledTimes(1)
    release()
    await first

    vi.mocked(api.undoScenarioChoice).mockRejectedValue(new Error('boom'))
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await undoApi.undoScenario()
    expect(opts.processing.value).toBe(false)
    expect(vi.mocked(opts.setGameQuestion).mock.calls.at(-1)?.[0]).toEqual({
      p1: { tag: 'ChooseOne' },
    })
    consoleSpy.mockRestore()
  })

  it('undoBoundary 锁早退：锁检查在所有副作用之前', async () => {
    let release!: () => void
    vi.mocked(api.undoAction).mockReturnValue(new Promise<void>((r) => (release = r)))
    const { undoApi, opts } = setup()
    const first = undoApi.undoActionStart()
    // undoBoundary 先检查锁，重入时副作用不触发
    await undoApi.undoActionStart()
    expect(api.undoAction).toHaveBeenCalledTimes(1)
    expect(opts.setGameQuestion).toHaveBeenCalledTimes(1) // 重入未触发副作用
    release()
    await first
  })

  it('undoBoundary 失败：恢复旧 question、processing 回 false、锁释放', async () => {
    vi.mocked(api.undoTurn).mockRejectedValue(new Error('boom'))
    vi.mocked(api.undoRound).mockResolvedValue(undefined)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { undoApi, opts } = setup()
    await undoApi.undoTurnStart()
    expect(opts.processing.value).toBe(false)
    // 锁已释放，可再次调用
    await undoApi.undoRoundStart()
    expect(api.undoRound).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it('canUndo*：scenarioSteps 与边界步比较；边界为 null 或 game 为 null 时 false', async () => {
    const { undoApi, game } = setup()
    expect(undoApi.canUndoScenario.value).toBe(true)  // steps 5 > 1
    expect(undoApi.canUndoAction.value).toBe(true)    // 5 > 3
    expect(undoApi.canUndoTurn.value).toBe(false)     // undoTurnStep null
    expect(undoApi.canUndoPhase.value).toBe(false)    // 5 > 6 不成立
    expect(undoApi.canUndoRound.value).toBe(true)     // 5 > 1
    game.value = null
    await nextTick()
    expect(undoApi.canUndoScenario.value).toBe(false)
    expect(undoApi.canUndoAction.value).toBe(false)
  })
})
