import { describe, expect, it } from 'vitest'
import { pinchedZoom, wheelPinchedZoom } from './usePinchZoom'

describe('pinchedZoom', () => {
  it('双指距离比例缩放', () => {
    expect(pinchedZoom(1, 100, 200)).toBe(2)
    expect(pinchedZoom(2, 200, 100)).toBe(1)
  })

  it('夹在 [0.25, 6] 区间', () => {
    expect(pinchedZoom(1, 100, 1000)).toBe(6)
    expect(pinchedZoom(0.3, 100, 10)).toBe(0.25)
  })

  it('初始距离为 0 时返回原值', () => {
    expect(pinchedZoom(1.5, 0, 100)).toBe(1.5)
  })

  it('保留三位小数', () => {
    expect(pinchedZoom(1, 300, 100)).toBe(0.333)
  })
})

describe('wheelPinchedZoom', () => {
  it('deltaY 为负（张开）放大，为正（捏合）缩小', () => {
    expect(wheelPinchedZoom(1, -10)).toBeGreaterThan(1)
    expect(wheelPinchedZoom(1, 10)).toBeLessThan(1)
  })

  it('放大缩小互为逆操作（指数映射对称）', () => {
    const zoomedIn = wheelPinchedZoom(1, -50)
    expect(wheelPinchedZoom(zoomedIn, 50)).toBeCloseTo(1, 2)
  })

  it('夹在 [0.25, 6] 区间', () => {
    expect(wheelPinchedZoom(5, -1000)).toBe(6)
    expect(wheelPinchedZoom(0.3, 1000)).toBe(0.25)
  })

  it('currentZoom 为 0 时按 1 处理', () => {
    expect(wheelPinchedZoom(0, 0)).toBe(1)
  })
})
