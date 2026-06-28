import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import OverlayDrawer from './OverlayDrawer.vue'

describe('OverlayDrawer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders docked drawers in the target without a full-screen backdrop', async () => {
    document.body.innerHTML = '<div id="dock"></div>'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const props = reactive({
      open: true,
      keepMounted: true,
      side: 'bottom' as const,
      dockTarget: '#dock',
    })
    const app = createApp({
      render: () =>
        h(OverlayDrawer, props as any, {
          default: () => h('div', { class: 'drawer-content' }, 'Docked content'),
        }),
    })

    app.mount(host)
    await nextTick()

    expect(document.querySelector('.overlay-drawer-backdrop')).toBeNull()
    expect(document.querySelector('#dock .overlay-drawer')).not.toBeNull()
    expect(document.querySelector('#dock .drawer-content')?.textContent).toBe('Docked content')

    app.unmount()
  })

  it('renders docked drawers once a same-tree target appears', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const props = reactive({
      open: true,
      keepMounted: true,
      side: 'bottom' as const,
      dockTarget: '#dock',
    })
    const app = createApp({
      render: () =>
        h('div', [
          h(OverlayDrawer, props as any, {
            default: () => h('div', { class: 'drawer-content' }, 'Late docked content'),
          }),
          h('div', { id: 'dock' }),
        ]),
    })

    app.mount(host)
    await nextTick()
    await nextTick()

    expect(document.querySelector('.overlay-drawer-backdrop')).toBeNull()
    expect(document.querySelector('#dock .overlay-drawer')).not.toBeNull()
    expect(document.querySelector('#dock .drawer-content')?.textContent).toBe('Late docked content')

    app.unmount()
  })
})
