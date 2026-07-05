import { describe, expect, it } from 'vitest'
import storyQuestionSource from './StoryQuestion.vue?raw'
import storyEntrySource from './StoryEntry.vue?raw'

describe('Story question mobile shell layout contract', () => {
  it('marks story questions rendered inside the phone shell', () => {
    expect(storyQuestionSource).toContain("import { usePhoneShell } from '@/arkham/composables/phoneShell'")
    expect(storyQuestionSource).toContain('const phoneShell = usePhoneShell()')
    expect(storyQuestionSource).toContain("'story-question-root--phone-shell': phoneShell")
  })

  it('lets opening story text scroll within the phone shell instead of under the bottom nav', () => {
    expect(storyEntrySource).toContain('.story-question-root--phone-shell')
    expect(storyEntrySource).toContain('max-height: 100%')
    expect(storyEntrySource).toContain('padding-bottom: 0')
  })
})
