import { ref } from 'vue'
import * as Api from '@/arkham/api'

// bug 上报流程状态机：表单（filingBug）→ 提交占位页（submittingBug）→ 打开 GitHub issue。
// 失败提示方式由调用方注入（桌面 alert / 手机 shell 可换内嵌提示）。
export function useBugReport(opts: { gameId: () => string; onFail: () => void }) {
  const filingBug = ref(false)
  const submittingBug = ref(false)
  const bugInitialDescription = ref('')

  function openBugReport(initialDescription = '') {
    bugInitialDescription.value = initialDescription
    filingBug.value = true
  }

  function fileBug(bugTitle: string, bugDescription: string) {
    submittingBug.value = true
    filingBug.value = false
    Api.fileBug(opts.gameId())
      .then((response) => {
        const title = encodeURIComponent(bugTitle)
        const body = encodeURIComponent(
          `${bugDescription}\n\ngame: ${window.location.href}\nfile: ${response.data}`,
        )
        window.open(
          `https://github.com/halogenandtoast/ArkhamHorror/issues/new?labels=bug&title=${title}&body=${body}&assignee=halogenandtoast&projects=halogenandtoast/2`,
          '_blank',
        )
        submittingBug.value = false
      })
      .catch(() => {
        opts.onFail()
        submittingBug.value = false
      })
  }

  return { filingBug, submittingBug, bugInitialDescription, openBugReport, fileBug }
}
