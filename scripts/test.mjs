import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

// Compile only the pure model/store modules; Node's built-in test runner needs no additional dependencies.
const target = '.verification/unit'
await mkdir(target, { recursive: true })
await writeFile(`${target}/package.json`, '{"type":"commonjs"}')
for (const source of ['src/ai/options.ts', 'src/ai/context.ts', 'src/ai/preview.ts', 'src/ai/library.ts', 'src/ai/schema.ts', 'src/ai/layout.ts', 'src/ai/prompt.ts', 'src/ai/client.ts', 'src/ai/settings.ts', 'src/ai/settingsStore.ts', 'src/graph/context.ts', 'src/data/types.ts', 'src/data/migration.ts', 'src/data/projectFile.ts', 'src/data/replaceProject.ts', 'src/store/useProject.ts', 'src/store/useGraph.ts', 'src/board/geometry.ts', 'src/board/textHeight.ts', 'src/graph/model.ts', 'src/graph/contentSize.ts', 'src/graph/layout.ts', 'src/graph/organize.ts', 'src/graph/flowTypes.ts', 'tests/fixtures/graph.ts']) {
  const output = `${target}/${source.replace(/\.ts$/, '.js')}`
  await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true })
  const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } })
  await writeFile(output, result.outputText)
}
const result = spawnSync(process.execPath, ['--test', 'tests/board.test.mjs', 'tests/graph.test.mjs', 'tests/projectFile.test.mjs', 'tests/ai.test.mjs', 'tests/ai-upgrade.test.mjs', 'tests/context.test.mjs', 'tests/privacy.test.mjs'], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
