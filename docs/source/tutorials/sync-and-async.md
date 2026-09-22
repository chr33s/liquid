---
title: Sync and Async
---

Execution APIs return Promises. Parsing an in-memory string with `engine.parse()` remains synchronous; rendering, file loading, evaluation, and static analysis must be awaited. See [Migrate to LiquidJS 11](./migrate-to-11.md) for removed APIs.

```javascript
const templates = engine.parse('Hello {{ name }}')
const html = await engine.render(templates, { name: 'Ada' })
```

Tags and filters may return values, Promises, or execution generators. One generator evaluator resolves suspension-capable values in order. Pure filters can remain ordinary functions.

```javascript
import { Tag, Value } from '@chr33s/liquid'

class UpperTag extends Tag {
  constructor(token, tokens, liquid) {
    super(token, tokens, liquid)
    this.value = new Value(token.args, liquid)
  }
  *render(ctx, emitter) {
    const value = yield this.value.value(ctx)
    yield emitter.write(String(value).toUpperCase())
  }
}
engine.registerTag('upper', UpperTag)
```

Direct writers must `yield emitter.write(value)` in generators or `await emitter.write(value)` in async methods. Writes can suspend while a stream is backpressured. Collecting emitters expose accumulated text through `buffer`; streaming emitters keep `buffer` empty. Use a collecting render for captures.

Pass `{ signal }` to execution APIs to request cooperative cancellation. Extension providers can use `ctx.signal`; extension code must cooperate to stop its own side effects. Cancellation does not preempt synchronous JavaScript or parsing.
