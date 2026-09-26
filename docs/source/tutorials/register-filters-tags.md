---
title: Register Filters and Tags
---

## Register Tags

`registerTag` takes a class. The engine constructs it with the tag token, the remaining tokens, the {@link Liquid} instance, and the current parser. The parser is the fourth argument. {@link Tag} does not store it. `Liquid.parser` is deprecated and is not that argument.

```typescript
// Usage: {% upper name %}
import { Value, Tag, TagToken, Context, TopLevelToken, Liquid } from '@chr33s/liquid'

engine.registerTag('upper', class UpperTag extends Tag {
    private value: Value
    constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
        super(tagToken, remainTokens, liquid)
        this.value = new Value(tagToken.args, liquid)
    }
    * render(ctx: Context) {
        const str = yield this.value.value(ctx) // 'alice'
        return String(str).toUpperCase() // 'ALICE'
    }
})
```

`render` combines the parsed tag with the current scope and returns a string, a Promise, or a generator. Read child tokens from `remainTokens` until the end token. Pass the fourth constructor argument when the tag needs the parser. See [Render Tag Content](./render-tag-content.md).

```typescript
// Usage: {% upper name:"alice" %}
import { Hash, Tag, TagToken, Context, TopLevelToken, Liquid } from '@chr33s/liquid'

engine.registerTag('upper', class UpperTag extends Tag {
    private hash: Hash
    constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
        super(tagToken, remainTokens, liquid)
        this.hash = new Hash(tagToken.args)
    }
    * render(ctx: Context) {
        const hash = yield this.hash.render(ctx)
        return hash.name.toUpperCase() // 'ALICE'
    }
})
```

See existing tag implementations here: <https://github.com/harttle/liquidjs/tree/master/src/tags>
See demo example here: https://github.com/chr33s/liquid/blob/main/demo/typescript/index.ts

## Register Filters

```javascript
// Usage: {{ name | upper }}
engine.registerFilter('upper', v => v.toUpperCase())
```

Filter arguments will be passed to the registered filter function, for example:

```javascript
// Usage: {{ 1 | add: 2, 3 }}
engine.registerFilter('add', (initial, arg1, arg2) => initial + arg1 + arg2)
```

See existing filter implementations here: <https://github.com/harttle/liquidjs/tree/master/src/filters>

## Unregister Tags/Filters

Remove a filter or a tag by name:

```javascript
engine.unregisterFilter('plus')
engine.unregisterTag('include')
```

An unregistered tag fails later with `tag "..." not found`. With [`strictFilters`](./options.md) enabled, an unregistered filter throws. Otherwise the filter is skipped. Registering the same name again replaces the previous implementation.

Built-in filters can be registered again using the exported `filters` object:

```javascript
import { filters } from '@chr33s/liquid'

engine.registerFilter('plus', filters.plus)
```

To keep the name registered and fail with your own message, register a throwing implementation (see [#324](https://github.com/harttle/liquidjs/issues/324)):

```javascript
// disable a tag
import { Tag } from '@chr33s/liquid'
const disabledTag = class extends Tag {
    constructor(token, tokens, liquid) {
        super(token, tokens, liquid)
        throw new Error(`tag "${token.name}" disabled`);
    }
}
engine.registerTag('include', disabledTag);

// disable a filter
function disabledFilter(name) {
    return function () {
        throw new Error(`filter "${name}" disabled`);
    }
}
engine.registerFilter('plus', disabledFilter('plus'));
```
