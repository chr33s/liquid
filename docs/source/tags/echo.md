---
title: echo
---

**Since:** v9.31.0

Outputs an expression in the rendered HTML. This is identical to wrapping an expression in <code>{{</code> and <code>}}</code>, but works inside liquid tags and supports filters.

## echo

Input
```liquid
{% assign username = 'Bob' %}
{% echo username | append: ", welcome to LiquidJS!" | capitalize %}
```

Output
```text
Bob, welcome to LiquidJS!
```
