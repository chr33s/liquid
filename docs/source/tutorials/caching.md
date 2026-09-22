---
title: Caching
---

In a typical website project, we'll have a directory of view templates and they'll be rendered multiple times. In a production environment the template files are not likely to change over time (other than re-deployments). Thus it makes sense to cache the file contents and the parsed templates (in a kind of AST) to improve performance.

LiquidJS provides multiple ways to cache the parsed templates to improve performance.

## Programmatically

The {@link Liquid.parse | .parse()}, {@link Liquid.parseFile | .parseFile()} APIs are used to parse templates from strings or files. The resulting template can then be rendered multiple times with different context.

Parse from string:

```javascript
var tpl = engine.parse('{{name | capitalize}}');

await engine.render(tpl, {name: 'alice'}) // 'Alice'
await engine.render(tpl, {name: 'bob'}) // 'Bob'
```

Parse from file:

```javascript
var tpl = await engine.parseFile('hello');    // contents of `hello.liquid`: {{name}}

await engine.render(tpl, {name: 'alice'}) // 'Alice'
await engine.render(tpl, {name: 'bob'}) // 'Bob'
```

The template string/file is parsed only once and rendered multiple times using different context. Templates for different files can be stored into a `Map` and can be retrieved directly for subsequent renders.

## The `cache` Option

The {@link LiquidOptions.cache | cache option} can be set to instruct liquidjs to use cached parsed templates each time you call {@link Liquid.renderFile | renderFile}.

```javascript
import { Liquid } from '@chr33s/liquid'
var engine = new Liquid({
    cache: true
});

// liquidjs parses the hello.liquid, then renders it with {name: 'alice'}
await engine.renderFile('hello', {name: 'alice'})

// liquidjs finds the cached template, then renders it with {name: 'bob'}
await engine.renderFile('hello', {name: 'bob'})
```
