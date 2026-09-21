---
title: Tags
description: Description and demo for each Liquid tag
children:
  - ./assign.md
  - ./capture.md
  - ./case.md
  - ./comment.md
  - ./cycle.md
  - ./decrement.md
  - ./echo.md
  - ./for.md
  - ./if.md
  - ./include.md
  - ./increment.md
  - ./inline_comment.md
  - ./layout.md
  - ./liquid.md
  - ./raw.md
  - ./render.md
  - ./tablerow.md
  - ./unless.md
---

LiquidJS implements business-logic independent tags that are typically implemented in [shopify/liquid][shopify/liquid]. This section contains the specification and demos for all the tags implemented by LiquidJS.

There are a dozen tags supported by LiquidJS, including all tags in [shopify/liquid][shopify/liquid]. These tags can be categorized into these groups:

Category | Purpose | Tags
--- | --- | ---
Iteration | iterate over a collection | `for`, `cycle`, `tablerow`
Control Flow | control the execution branch of template rendering | `if`, `unless`, `elsif`, `else`, `case`, `when`
Variable | define and alter variables | `assign`, `increment`, `decrement`, `capture`, `echo`
File | include another template or extend a layout template | `render`, `include`, `layout`
Language | temporarily disable LiquidJS syntax | `#`, `raw`, `comment`, `liquid`

[shopify/liquid]: https://github.com/Shopify/liquid
