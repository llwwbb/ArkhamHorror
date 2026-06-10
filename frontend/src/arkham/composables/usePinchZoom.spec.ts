import { describe, expect, it } from 'vitest'
import { pinchedZoom } from './usePinchZoom'

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
