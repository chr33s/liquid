---
title: Parse Parameters
---

## Access Raw Parameters

As covered in [Register Filters/Tags](./register-filters-tags.md), tag parameters are available on `tagToken.args` as a raw string. For example:

```javascript
import { Tag } from '@chr33s/liquid'

// Usage: {% random foo bar coo %}
// Output: "foo", "bar" or "coo"
engine.registerTag('random', class extends Tag {
  constructor(tagToken, remainTokens, liquid) {
    super(tagToken, remainTokens, liquid)
    // tagToken.args === "foo bar coo"
    this.items = tagToken.args.split(' ')
  }
  *render(context, emitter) {
    // get a random index
    const index = Math.floor(this.items.length * Math.random())
    // output that item
    yield emitter.write(this.items[index])
  }
})
```

Here's a JSFiddle version: <https://jsfiddle.net/ctj364up/2/>

## Parse Parameters as Values

Sometimes we need more dynamic tags and want to pass values to the custom tag instead of static strings. Variables in LiquidJS can be literal (string, number, etc.) or a variable from current context scope.

The following modified template also contains 3 values to random from, but they're values instead of static strings. The first one is string literal, second one is an identifier, third one is a property access sequence containing two identifiers.

```liquid
{% random "foo" bar obj.coo %}
```

It can be tricky to parse all these cases manually, but there's a {@link Tokenizer | Tokenizer} class in LiquidJS you can make use of.

```javascript
import { Liquid, Tag, Tokenizer, evalToken } from '@chr33s/liquid'
engine.registerTag('random', class extends Tag {
  constructor(tagToken, remainTokens, liquid) {
    super(tagToken, remainTokens, liquid)
    const tokenizer = new Tokenizer(tagToken.args)
    this.items = []
    while (!tokenizer.end()) {
      // here readValue() returns a LiteralToken or PropertyAccessToken
      this.items.push(tokenizer.readValue())
    }
  }
  * render(context, emitter) {
    const index = Math.floor(this.items.length * Math.random())
    const token = this.items[index]
    // in LiquidJS, we use yield to wait for async call
    const value = yield evalToken(token, context)
    yield emitter.write(value)
  }
})
```

Calling this tag in scope `{ bar: "bar", obj: { coo: "coo" } }` yields exactly the same result as the first example. See this JSFiddle: <https://jsfiddle.net/ctj364up/3/>

> **Async and Promises**
>
> Generator extensions use `yield` to resolve Promises and nested generators. Direct writers must yield write completion. See [Sync and Async](./sync-and-async.md).

## Parse Key-Value Pairs as Named Parameters

Named parameters become very handy when there are optional parameters or lots of parameters, in which case the order of parameters is not important. This is exactly what the {@link Hash | Hash} class was invented for.

```liquid
{% random from:2, to:max %}
```

In the above example, we're trying to generate a random number in the range [2, max]. We'll use `Hash` to parse `from` and `to` parameters.

```javascript
import { Liquid, Tag, Hash } from '@chr33s/liquid'

engine.registerTag('random', class extends Tag {
  constructor(tagToken, remainTokens, liquid) {
    super(tagToken, remainTokens, liquid)
    // parse the parameters structure into `this.args`
    this.args = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
  }
  * render(context, emitter) {
    // evaluate the parameters in `context`
    const {from, to} = yield this.args.render(context)
    const length = to - from + 1
    const value = from + Math.floor(length * Math.random())
    yield emitter.write(value)
  }
})
```

Rendering `{% random from:2, to:max %}` in scope `{ max: 10 }` will generate a random number in the range [2, 10]. See this JSFiddle: <https://jsfiddle.net/ctj364up/4/>
