---
title: sort_natural
---

**Since:** v8.4.0

Sorts items in an array in case-insensitive order.

Input
```liquid
{% assign my_array = "zebra, octopus, giraffe, Sally Snake" | split: ", " %}

{{ my_array | sort_natural | join: ", " }}
```

Output
```text


giraffe, octopus, Sally Snake, zebra
```

An optional argument specifies which property of the array's items to use for sorting.

```liquid
{% assign products_by_company = collection.products | sort_natural: "company" %}
{% for product in products_by_company %}
  <h4>{{ product.title }}</h4>
{% endfor %}
```

Items are compared as text, so a mix of numbers and strings sorts without an error: `[10, 2, "b", "A"]` sorts to `10, 2, A, b`. `nil` sorts last.
