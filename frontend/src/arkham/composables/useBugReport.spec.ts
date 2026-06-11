import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useBugReport } from './useBugReport'
import * as Api from '@/arkham/api'

vi.mock('@/arkham/api', () => ({
  fileBug: vi.fn(),
}))

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('useBugReport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('openBugReport：带初始描述打开表单', () => {
    const r = useBugReport({ gameId: () => 'g1', onFail: vi.fn() })
    r.openBugReport('boom stack')
    expect(r.filingBug.value).toBe(true)
    expect(r.bugInitialDescription.value).toBe('boom stack')
  })

  it('fileBug 成功：关表单→submitting→打开 GitHub issue→复位', async () => {
    vi.mocked(Api.fileBug).mockResolvedValue({ data: 'debug-file-url' } as unknown as { data: string })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const r = useBugReport({ gameId: () => 'g1', onFail: vi.fn() })
    r.openBugReport()
    r.fileBug('title', 'desc')
    expect(r.filingBug.value).toBe(false)
    expect(r.submittingBug.value).toBe(true)
    await flush()
    expect(Api.fileBug).toHaveBeenCalledWith('g1')
    expect(open).toHaveBeenCalledOnce()
    const url = open.mock.calls[0][0] as string
    expect(url).toContain('github.com/halogenandtoast/ArkhamHorror/issues/new')
    expect(url).toContain(encodeURIComponent('debug-file-url'))
    expect(r.submittingBug.value).toBe(false)
    open.mockRestore()
  })

  it('fileBug 失败：调 onFail 并复位 submitting', async () => {
    vi.mocked(Api.fileBug).mockRejectedValue(new Error('nope'))
    const onFail = vi.fn()
    const r = useBugReport({ gameId: () => 'g1', onFail })
    r.fileBug('t', 'd')
    await flush()
    expect(onFail).toHaveBeenCalledOnce()
    expect(r.submittingBug.value).toBe(false)
  })
})
