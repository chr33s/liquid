---
title: ifchanged
---

**Since:** v12.0.0

Outputs its body only when the rendered result differs from the previous time an `ifchanged` block ran. The body is still executed every time.

Input
```liquid
{% for product in products %}
  {% ifchanged %}{{ product.type }}{% endifchanged %}
{% endfor %}
```

Sibling `ifchanged` blocks share one memory through the render context, so consecutive duplicates are suppressed across them rather than per block.
