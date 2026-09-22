---
title: if
---

**Since:** v1.9.1

Executes a block of code only if a certain condition is `true`.

## if

Input
```liquid
{% if product.title == "Awesome Shoes" %}
  These shoes are awesome!
{% endif %}
```

Output
```text
These shoes are awesome!
```

## elsif / else

Adds more conditions within an `if` or `unless` block.

Input
```liquid
<!-- If customer.name = "anonymous" -->
{% if customer.name == "kevin" %}
  Hey Kevin!
{% elsif customer.name == "anonymous" %}
  Hey Anonymous!
{% else %}
  Hi Stranger!
{% endif %}
```

Output
```text
Hey Anonymous!
```

Only the first `else` renders: an `elsif` or `else` after it is parsed but never reached, and any text after `else` inside the tag is ignored, as in the reference engine.

A block whose branches hold only whitespace, `assign`, `capture` and comments is blank: its whitespace is not written. The same holds for `unless`, `case` and `for`.
