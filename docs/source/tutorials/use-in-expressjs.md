---
title: Use in Express
---

LiquidJS is compatible with [Express template engines](https://expressjs.com/en/resources/template-engines.html). You can set the LiquidJS instance as the [view engine][express-views] option:

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
> Here's a working demo for LiquidJS usage in Express.js: <a href="https://github.com/chr33s/liquid/tree/main/demo/express/" target="_blank">demo/express/</a>.

## Template Lookup

The {@link LiquidOptions.root | root} option will continue to work as templates root, as you can see in [Render A Template File](./render-file.md). Additionally, the [`views`][express-views] option in express.js (as shown above) will also be respected. Say you have a template directory like:

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
