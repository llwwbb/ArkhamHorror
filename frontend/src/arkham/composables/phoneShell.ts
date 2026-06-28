import { inject, provide, type InjectionKey, type Ref } from 'vue'

// 手机 shell 与深层组件（Scenario/Player）之间的小协议：
// - 注入存在 ⇒ 当前在手机 shell 内（Scenario 据此隐藏 .phases、把 player-zone 交给抽屉）
// - 抽屉开关由 shell 持有，深层组件只读写 Ref
export interface PhoneShellControls {
  handOpen: Ref<boolean>
  playersOpen: Ref<boolean>
  bottomDockTarget: string
}

export const phoneShellKey: InjectionKey<PhoneShellControls> = Symbol('phoneShell')

export function providePhoneShell(controls: PhoneShellControls) {
  provide(phoneShellKey, controls)
}

export function usePhoneShell() {
  return inject(phoneShellKey, null)
}
