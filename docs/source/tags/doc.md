---
title: doc
---

**Since:** v12.0.0

Documents a template or snippet. The body is retained for tooling, is never executed, and renders nothing.

Input
```liquid
{% doc %}
  Renders a product card.
  @param {object} product
{% enddoc %}
```

Output
```text
```

The body is read verbatim, so it may hold unbalanced Liquid. A `doc` block cannot be nested inside another (`Syntax Error in 'doc' - Nested doc tags are not allowed`), and the opening tag takes no arguments (`Syntax Error in 'doc' - Valid syntax: {% doc %}{% enddoc %}`).
