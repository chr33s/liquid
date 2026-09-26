---
title: Use in Express
---

LiquidJS is compatible with [Express template engines](https://expressjs.com/en/resources/template-engines.md). You can set the LiquidJS instance as the [view engine][express-views] option:

```javascript
import { Liquid } from '@chr33s/liquid'
var engine = new Liquid();

// register liquid engine
app.engine('liquid', engine.express());
app.set('views', './views');            // specify the views directory
app.set('view engine', 'liquid');       // set liquid to default
```

> **Working Demo**
>
> The runnable server demo uses <a href="https://srvx.h3.dev" target="_blank">srvx</a>: <a href="https://github.com/chr33s/liquid/tree/main/demo/srvx/" target="_blank">demo/srvx/</a>. `engine.express()` remains the Express view-engine adapter and is shown above.

## Template Lookup

The {@link LiquidOptions.root | root} option will continue to work as templates root, as you can see in [Render A Template File](./render-file.md). Additionally, the [`views`][express-views] option in express.js (as shown above) will also be respected.

The first call to the function returned by `engine.express()` prepends that view's `root` onto the engine's `root`, `layouts`, and `partials`. Later renders on the same engine, including `renderFile()`, use those updated paths. The object passed to `new Liquid()` is not modified. Each engine prepends once, even when `express()` is called again.

Say you have a template directory like:

```
.
├── views1/
│ └── hello.liquid
└── views2/
  └── world.liquid
```

And you're setting template root for liquidjs to `views1` and expressjs to `views2`:

```javascript
import { Liquid } from '@chr33s/liquid'
var engine = new Liquid({
    root: './views1/'
});

app.engine('liquid', engine.express());
app.set('views', './views2');            // specify the views directory
app.set('view engine', 'liquid');       // set liquid to default
```

Both of `hello.liquid` and `world.liquid` can be resolved and rendered:

```javascript
res.render('hello')
res.render('world')
```

## Caching

Simply setting the {@link LiquidOptions.cache | cache option} to true will enable template caching, as explained in [Caching](./caching.md). It's recommended to enable cache in a production environment, which can be done by:

```javascript
import { Liquid } from '@chr33s/liquid'
var engine = new Liquid({
    cache: process.env.NODE_ENV === 'production'
});
```

[express-views]: https://expressjs.com/en/guide/using-template-engines.html
[layout]: https://help.shopify.com/en/themes/liquid/tags/theme-tags#layout
[include]: https://help.shopify.com/themes/liquid/tags/theme-tags#include
