import { Liquid } from '@chr33s/liquid'
import { getOutputs } from './get-outputs.ts'

const engine = new Liquid({
  root: import.meta.dirname,
  extname: '.liquid'
})

const templates = await engine.parseFile('todolist')

for (const output of getOutputs(templates)) {
  const token = output.token
  const [line, col] = token.getPosition()
  const text = token.getText()
  console.log(`[${line}:${col}] ${text}`)
}
