import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useGameModals } from './useGameModals'
import { useGameSocket } from './useGameSocket'
import * as Arkham from '@/arkham/types/Game'
import * as Message from '@/arkham/types/Message'

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

  it('uiLock 锁住时 GameUpdate 刷新棋盘但隐藏 question，解锁后恢复 question', async () => {
    const { socket, modals } = makeSocket()
    await flush()
    modals.uiLock.value = true
    await nextTick() // 让 watcher 先观察到锁定，否则同 tick 内 true→false 不触发
    const updated = { log: [], question: { p1: {} }, activePlayerId: 'p1' } as any
    const decodeSpy = vi
      .spyOn(Arkham.gameDecoder, 'decodePromise')
      .mockResolvedValue(updated)
    pushMessage({ tag: 'GameUpdate', contents: '{}' })
    await flush()
    expect(decodeSpy).toHaveBeenCalledOnce()
    expect(socket.game.value?.question).toEqual({})
    modals.uiLock.value = false
    await nextTick()
    await flush()
    expect(decodeSpy).toHaveBeenCalledTimes(2)
    expect(socket.game.value?.question).toEqual({ p1: {} })
    decodeSpy.mockRestore()
  })

  it('排空中途再上锁：GameCard 重放后重新锁定，GameUpdate 留在队列等下次解锁', async () => {
    const { modals } = makeSocket()
    await flush()
    modals.uiLock.value = true
    await nextTick() // 让 watcher 先观察到锁定，否则同 tick 内 true→false 不触发
    const showSpy = vi.spyOn(modals, 'showGameCard')
    const decodeSpy = vi
      .spyOn(Arkham.gameDecoder, 'decodePromise')
      .mockResolvedValue({ log: [], question: { p1: {} }, activePlayerId: 'p1' } as any)
    pushMessage({ tag: 'GameCard', title: 'A', card: {} })
    pushMessage({ tag: 'GameUpdate', contents: '{}' })
    await flush()
    expect(showSpy).not.toHaveBeenCalled()
    expect(decodeSpy).toHaveBeenCalledOnce()
    modals.uiLock.value = false
    await nextTick()
    // GameCard 重放，真实 showGameCard 同步重新上锁 → drain break，GameUpdate 仍排队
    expect(showSpy).toHaveBeenCalledOnce()
    expect(modals.uiLock.value).toBe(true)
    expect(decodeSpy).toHaveBeenCalledOnce()
    // 关掉弹窗解锁后，剩余的 GameUpdate 才被排空
    modals.continueUI()
    await flush()
    expect(decodeSpy).toHaveBeenCalledTimes(2)
    decodeSpy.mockRestore()
  })

  it('解码期间连续 GameUpdate 只保留最新一条（pendingUpdate 合并）', async () => {
    makeSocket()
    await flush()
    const resolvers: ((g: unknown) => void)[] = []
    const decodeSpy = vi
      .spyOn(Arkham.gameDecoder, 'decodePromise')
      .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)) as any)
    pushMessage({ tag: 'GameUpdate', contents: '1' })
    pushMessage({ tag: 'GameUpdate', contents: '2' })
    pushMessage({ tag: 'GameUpdate', contents: '3' })
    // '1' 在解码中，'2'/'3' 进 pendingUpdate 且后者覆盖前者
    expect(decodeSpy).toHaveBeenCalledTimes(1)
    expect(decodeSpy).toHaveBeenNthCalledWith(1, '1')
    resolvers[0]({ log: [], question: { p1: {} }, activePlayerId: 'p1' })
    await flush()
    expect(decodeSpy).toHaveBeenCalledTimes(2)
    expect(decodeSpy).toHaveBeenNthCalledWith(2, '3')
    resolvers[1]({ log: [], question: { p1: {} }, activePlayerId: 'p1' })
    await flush()
    expect(decodeSpy).toHaveBeenCalledTimes(2) // '2' 被合并掉，不再解码
    decodeSpy.mockRestore()
  })

  it('skipAllTriggers 逐个玩家发送 Skip，直到没有 SkipTriggersButton 为止', async () => {
    const skipQ = () => ({
      tag: 'ChooseOne',
      choices: [{ tag: Message.MessageType.SKIP_TRIGGERS_BUTTON }],
    })
    const mkGame = (question: Record<string, unknown>, scenarioSteps: number) =>
      ({ log: [], question, activePlayerId: 'p1', scenarioSteps }) as any
    const { socket } = makeSocket()
    await flush()
    const decodeSpy = vi.spyOn(Arkham.gameDecoder, 'decodePromise')
    // 两个玩家都有 SkipTriggersButton
    decodeSpy.mockResolvedValueOnce(mkGame({ p1: skipQ(), p2: skipQ() }, 7))
    pushMessage({ tag: 'GameUpdate', contents: 'u1' })
    await flush()
    expect(socket.skipAllAvailable.value).toBe(true)
    socket.skipAllTriggers()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sendSpy.mock.calls[0][0])).toEqual({
      tag: 'Answer',
      contents: { choice: 0, playerId: 'p1', questionVersion: 7 },
    })
    // 下一次 GameUpdate 只剩 p2 有 Skip → continueSkipAll 自动补发
    decodeSpy.mockResolvedValueOnce(mkGame({ p2: skipQ() }, 8))
    pushMessage({ tag: 'GameUpdate', contents: 'u2' })
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(JSON.parse(sendSpy.mock.calls[1][0])).toEqual({
      tag: 'Answer',
      contents: { choice: 0, playerId: 'p2', questionVersion: 8 },
    })
    // 再下一次没有任何 Skip 选项 → 链终止，不再发送
    decodeSpy.mockResolvedValueOnce(mkGame({ p1: { tag: 'ChooseOne', choices: [] } }, 9))
    pushMessage({ tag: 'GameUpdate', contents: 'u3' })
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(2)
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
