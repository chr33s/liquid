import { Liquid } from '../..'

describe('#evalValueSync()', function () {
  let engine: Liquid
  beforeEach(() => {
    engine = new Liquid()
  })

  it('should eval value synchronously', async function () {
    return expect(engine.evalValueSync('true', { opts: {} } as any)).toBe(true)
  })
})
