#!/usr/bin/env node
const { performance } = require('perf_hooks')
const path = require('path')
const { createEngine } = require('./engines/create-liquid')
const data = require('./data/todolist.json')

async function main () {
  const [candidatePath, baselinePath] = process.argv.slice(2)
  console.log(`Candidate: ${candidatePath}\nBaseline: ${baselinePath}\nRuntime: ${process.version}`)
  const engines = [baselinePath, candidatePath].map(file => createEngine(require(path.resolve(file))))
  const templates = engines.map(engine => engine.load(path.resolve(__dirname, 'templates/todolist')))
  const tasks = engines.map((engine, index) => () => engine.render(templates[index], data))
  for (const task of tasks) for (let i = 0; i < 100; i++) await task()
  const differences = []
  for (let pair = 0; pair < 5; pair++) {
    const rates = []
    for (const index of pair % 2 ? [1, 0] : [0, 1]) {
      let completed = 0
      const start = performance.now()
      do { await tasks[index](); completed++ } while (performance.now() - start < 2000)
      rates[index] = completed * 1000 / (performance.now() - start)
    }
    const diff = (rates[1] / rates[0] - 1) * 100
    differences.push(diff)
    console.log(`Pair ${pair + 1}: baseline ${rates[0].toFixed(3)}, candidate ${rates[1].toFixed(3)} ops/s; ${diff.toFixed(3)}%`)
  }
  const median = differences.sort((a, b) => a - b)[2]
  console.log(`Median relative throughput: ${median.toFixed(3)}%; gate: -3%`)
  process.exitCode = median < -3 ? 1 : 0
}
main().catch(error => { console.error(error); process.exitCode = 1 })
