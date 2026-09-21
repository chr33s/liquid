---
title: Contribution Guideline
---

## 👉👉👉 Star LiquidJS  [![harttle/liquidjs](https://img.shields.io/github/stars/harttle/liquidjs?style=flat-square)][liquidjs]

Starring LiquidJS is the most important and easiest way to support us: boost its rank and expose it to more people, which in turn makes it better.

## Show Me Your Code

Getting started and building is described in [CONTRIBUTING.md](https://github.com/chr33s/liquid/blob/main/CONTRIBUTING.md).

**Code Style**: LiquidJS applies [oxlint](https://oxc.rs/docs/guide/usage/linter.html) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html). Run `npm run lint` to check and `npm run format` to fix.

**Testing**: Make sure test cases pass with your patch merged by running `npm test`

**Commit Message**: Please align to [the Angular Commit Message Guidelines](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits), especially note the [type identifier](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#type), on which semantic-release bot depends.

**Backward-Compatibility**: please be backward-compatible. LiquidJS is used by multiple layers of software, including underlying libraries, compilers, site generators and Web servers. It's not easy to do a major upgrade for most of them.

## Financial Support

LiquidJS is Open Source and Free. To help it live and thrive, especially when LiquidJS is benefiting your business, consider contributing on [GitHub Sponsors](https://github.com/sponsors/harttle) or [Open Collective][oc].

I'll add all financial contributors into [README.md](https://github.com/harttle/liquidjs#financial-support) and it'll be also shown on https://liquidjs.com after next GitHub Actions build.

If I'm missing anything or you observed it not working, please don't hesitate to file an issue or find me via email (harttleharttle at gmail).

[oc]: https://opencollective.com/liquidjs/contribute/backer-10665/checkout
[shopify/liquid]: https://shopify.github.io/liquid/
[caniuse-promises]: https://caniuse.com/#feat=promises
[pp]: https://github.com/taylorhakes/promise-polyfill
[tutorial]: https://shopify.github.io/liquid/basics/introduction/
[liquidjs]: https://github.com/harttle/liquidjs
