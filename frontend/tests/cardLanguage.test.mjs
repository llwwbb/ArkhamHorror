import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

async function importTsModule(path) {
  const source = await readFile(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: path,
  })

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const modulePath = resolve('src/arkham/cardLanguage.ts')

test('card image parsing recognizes an a-sided card code', async () => {
  const { cardImagePartsFromImage } = await importTsModule(modulePath)

  assert.deepEqual(cardImagePartsFromImage('/img/arkham/cards/06169a.avif'), {
    code: '06169a',
    suffix: '',
  })
})

test('card definition lookup preserves a sides and resolves b sides to the front', async () => {
  const { cardDefinitionCodeFromImage } = await importTsModule(modulePath)

  assert.equal(cardDefinitionCodeFromImage?.('/img/arkham/cards/06169a.avif'), '06169a')
  assert.equal(cardDefinitionCodeFromImage?.('/img/arkham/cards/06169b.avif'), '06169')
})

test('card definition lookup retains support for non-AVIF card images', async () => {
  const { cardDefinitionCodeFromImage } = await importTsModule(modulePath)

  for (const extension of ['jpg', 'jpeg', 'png', 'webp']) {
    assert.equal(cardDefinitionCodeFromImage?.(`/img/arkham/cards/06169a.${extension}`), '06169a')
  }
})
