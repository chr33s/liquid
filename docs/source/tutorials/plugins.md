---
title: Plugins
---

A number of tags and filters can be encapsulated into a **plugin**, which will be typically installed via npm. This article provides information about how to create and use a plugin.

## Write a Plugin

A LiquidJS plugin is a simple function that takes the {@link Liquid | Liquid class} as the first parameter and uses the Liquid instance for `this`. We can call LiquidJS APIs on `this` to make certain changes, especially [register filters and tags](./register-filters-tags.md).

Now we'll make a plugin to uppercase every letter of the input. Save the following snippet to `upup.js`:

```javascript
/**
 * Inside the plugin function, `this` refers to the Liquid instance.
 *
 * @param Liquid: provides facilities to implement tags and filters.
 */
module.exports = function (Liquid) {
    this.registerFilter('upup', x => x.toUpperCase());
}
```

## Use a Plugin

Simply pass the plugin function into the `.plugin()` method:

```javascript
const engine = new Liquid()

engine.plugin(require('./upup.js'));
engine
    .parseAndRender('{{ "foo" | upup }}')
    .then(console.log)  // outputs "FOO"
```

## Plugin List

Since this library excludes certain features that are available on the Shopify platform but not on the [Shopify/liquid](https://github.com/Shopify/liquid/) repo, see [Differences with Shopify/liquid](./differences.md).

Here's a list of plugins that backfill those features. Feel free to add yours, this file is publicly editable.

* Sections Tags (WIP): https://github.com/harttle/liquidjs-section-tags
* Color Filters: https://github.com/harttle/liquidjs-color-filters
