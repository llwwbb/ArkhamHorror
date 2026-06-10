import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useGameModals } from './useGameModals'
import { useGameSocket } from './useGameSocket'
import * as Arkham from '@/arkham/types/Game'

// 只替换 cardDecoder（真实解码太重），其余导出（cardContentsDecoder 等）保持原样
vi.mock('@/arkham/types/Card', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cardDecoder: { decodePromise: (x: any) => Promise.resolve(x) },
}))

// 捕获 useWebSocket 的回调，模拟服务器推送
let wsOptions: any
const sendSpy = vi.fn()
vi.mock('@vueuse/core', () => ({
  useWebSocket: vi.fn((_url: unknown, options: unknown) => {
    wsOptions = options
    return { send: sendSpy, close: vi.fn() }
  }),
}))

vi.mock('@/stores/user', () => ({ useUserStore: () => ({ token: 'tok' }) }))
vi.mock('@/arkham/gameImagePreload', () => ({
  loadAllGameImages: vi.fn(() => Promise.resolve()),
  preloadGameImages: vi.fn(),
}))
vi.mock('@/arkham/api', () => ({
  fetchGame: vi.fn(() =>
    Promise.resolve({
      game: { log: [], question: { p1: {} }, scenarioSteps: 5 },
      playerId: 'p1',
      multiplayerMode: 'Solo',
    }),
  ),
}))

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function pushMessage(result: object) {
  wsOptions.onMessage(null, { data: JSON.stringify(result) })
}

function makeSocket(spectate = false) {
  const scope = effectScope()
  let socket!: ReturnType<typeof useGameSocket>
  let modals!: ReturnType<typeof useGameModals>
  scope.run(() => {
    modals = useGameModals()
    socket = useGameSocket({
      gameId: () => 'g1',
      spectate,
      modals,
      emitter: { emit: vi.fn() },
    })
  })
  return { socket, modals, scope }
}

describe('useGameSocket', () => {
  beforeEach(() => {
    sendSpy.mockClear()
  })

  it('初始 fetch 填充 game/playerId/ready/solo', async () => {
    const { socket } = makeSocket()
    await flush()
    expect(socket.ready.value).toBe(true)
    expect(socket.playerId.value).toBe('p1')
    expect(socket.solo.value).toBe(true)
  })

  it('GameMessage 追加到 gameLog', async () => {
    const { socket } = makeSocket()
    await flush()
    pushMessage({ tag: 'GameMessage', contents: 'hello' })
    expect(socket.gameLog.value).toContain('hello')
  })

  it('GameError 写入 error 并恢复 oldQuestion', async () => {
    const { socket } = makeSocket()
    await flush()
    socket.choose(2)
    expect(socket.game.value?.question).toEqual({})
    pushMessage({ tag: 'GameError', contents: 'boom' })
    expect(socket.error.value).toBe('boom')
    expect(socket.game.value?.question).toEqual({ p1: {} })
  })

  it('choose 发送 Answer（带 questionVersion），清空 question，置 processing', async () => {
    const { socket } = makeSocket()
    await flush()
    socket.choose(3)
    expect(socket.processing.value).toBe(true)
    expect(JSON.parse(sendSpy.mock.calls[0][0])).toEqual({
      tag: 'Answer',
      contents: { choice: 3, playerId: 'p1', questionVersion: 5 },
    })
  })

  it('spectate 模式 choose 不发送', async () => {
    const { socket } = makeSocket(true)
    await flush()
    socket.choose(3)
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('uiLock 锁住时 GameCard 入队，解锁后排空重放', async () => {
    const { modals } = makeSocket()
    await flush()
    modals.uiLock.value = true
    await nextTick() // 让 watcher 先观察到锁定，否则同 tick 内 true→false 不触发
    const showSpy = vi.spyOn(modals, 'showGameCard')
    pushMessage({ tag: 'GameCard', title: 'T', card: {} })
    expect(showSpy).not.toHaveBeenCalled()
    modals.uiLock.value = false
    await nextTick()
    expect(showSpy).toHaveBeenCalledOnce()
  })

  it('uiLock 锁住时 GameUpdate 入队并清空 question', async () => {
    const { socket, modals } = makeSocket()
    await flush()
    modals.uiLock.value = true
    await nextTick() // 让 watcher 先观察到锁定，否则同 tick 内 true→false 不触发
    const decodeSpy = vi
      .spyOn(Arkham.gameDecoder, 'decodePromise')
      .mockResolvedValue({ log: [], question: {}, activePlayerId: 'p1' } as any)
    pushMessage({ tag: 'GameUpdate', contents: '{}' })
    expect(decodeSpy).not.toHaveBeenCalled()
    expect(socket.game.value?.question).toEqual({})
    modals.uiLock.value = false
    await nextTick()
    expect(decodeSpy).toHaveBeenCalledOnce()
    decodeSpy.mockRestore()
  })

  it('GameUpdate 解码后更新 game 并预加载图片', async () => {
    const { socket } = makeSocket()
    await flush()
    const updated = { log: ['l1'], question: { p1: {} }, activePlayerId: 'p1' } as any
    const decodeSpy = vi.spyOn(Arkham.gameDecoder, 'decodePromise').mockResolvedValue(updated)
    pushMessage({ tag: 'GameUpdate', contents: '{}' })
    await flush()
    expect(socket.game.value).toBe(updated)
    expect(socket.gameLog.value).toEqual(['l1'])
    decodeSpy.mockRestore()
  })
})
