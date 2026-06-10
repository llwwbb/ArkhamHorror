import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeviceLayout, _resetForTests, TOUCH_QUERY, PHONE_QUERY } from './useDeviceLayout'

type Listener = (e: { matches: boolean }) => void

function mockMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Listener[]>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: initial[query] ?? false,
      addEventListener: (_event: string, cb: Listener) => {
        listeners.set(query, [...(listeners.get(query) ?? []), cb])
      },
    })),
  )
  return {
    fire(query: string, matches: boolean) {
      for (const cb of listeners.get(query) ?? []) cb({ matches })
    },
  }
}

describe('useDeviceLayout', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    _resetForTests()
  })

  it('窄屏 → phone，shell 为 phone', () => {
    mockMatchMedia({ [PHONE_QUERY]: true, [TOUCH_QUERY]: true })
    const { size, shell } = useDeviceLayout()
    expect(size.value).toBe('phone')
    expect(shell.value).toBe('phone')
  })

  it('宽屏 + 触控 → tablet，shell 为 desktop', () => {
    mockMatchMedia({ [PHONE_QUERY]: false, [TOUCH_QUERY]: true })
    const { size, shell, isTouch } = useDeviceLayout()
    expect(size.value).toBe('tablet')
    expect(shell.value).toBe('desktop')
    expect(isTouch.value).toBe(true)
  })

  it('宽屏 + 鼠标 → desktop', () => {
    mockMatchMedia({ [PHONE_QUERY]: false, [TOUCH_QUERY]: false })
    const { size, isTouch } = useDeviceLayout()
    expect(size.value).toBe('desktop')
    expect(isTouch.value).toBe(false)
  })

  it('媒体查询变化时响应式更新', () => {
    const mq = mockMatchMedia({ [PHONE_QUERY]: false, [TOUCH_QUERY]: false })
    const { size } = useDeviceLayout()
    expect(size.value).toBe('desktop')
    mq.fire(PHONE_QUERY, true)
    expect(size.value).toBe('phone')
  })
})
