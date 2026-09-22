---
title: sort
---

**Since:** v1.9.1

Sorts items in an array in case-sensitive order.

Input
```liquid
{% assign my_array = "zebra, octopus, giraffe, Sally Snake" | split: ", " %}

{{ my_array | sort | join: ", " }}
```

Output
```text


Sally Snake, giraffe, octopus, zebra
```

An optional argument specifies which property of the array's items to use for sorting.

```liquid
{% assign products_by_price = collection.products | sort: "price" %}
{% for product in products_by_price %}
  <h4>{{ product.title }}</h4>
{% endfor %}
```

Numbers sort with numbers and strings with strings, and `nil` sorts last. Items that cannot be ordered against each other, like a number and a string, raise `cannot sort values of incompatible types`; use [sort_natural](./sort_natural.md) to order them as text.
