---
title: Tags
description: Description and demo for each Liquid tag
children:
  - ./inline_comment.md
  - ./assign.md
  - ./capture.md
  - ./case.md
  - ./comment.md
  - ./cycle.md
  - ./decrement.md
  - ./doc.md
  - ./echo.md
  - ./for.md
  - ./if.md
  - ./ifchanged.md
  - ./include.md
  - ./increment.md
  - ./layout.md
  - ./liquid.md
  - ./raw.md
  - ./render.md
  - ./tablerow.md
  - ./unless.md
---

LiquidJS implements the tags of the reference [shopify/liquid][shopify/liquid] engine. This section contains the specification and demos for each of them.

These tags are available in both profiles:

Category | Purpose | Tags
--- | --- | ---
Iteration | iterate over a collection | `for`, `cycle`, `tablerow`
Control Flow | control the execution branch of template rendering | `if`, `unless`, `elsif`, `else`, `case`, `when`, `ifchanged`
Variable | define and alter variables | `assign`, `increment`, `decrement`, `capture`, `echo`
File | include another template | `render`, `include`
Language | temporarily disable LiquidJS syntax, or document a template | `#`, `raw`, `comment`, `doc`, `liquid`

The [Shopify theme profile](../tutorials/shopify-theme-profile.md) adds `layout`, `paginate`, `section`, `sections`, `content_for`, `schema`, `style`, `stylesheet`, `javascript` and `form`.

[shopify/liquid]: https://github.com/Shopify/liquid
