---
title: divided_by
---

**Since:** v1.9.1

Divides a number by another number.

The kind of the operands decides the kind of the division, as in the reference engine: two integers divide as integers, and a decimal on either side gives a decimal result.

Input
```liquid
{{ 16 | divided_by: 4 }}
{{ 5 | divided_by: 3 }}
{{ 5 | divided_by: 3.0 }}
```

Output
```text
4
1
1.6666666666666667
```

Integer division floors toward negative infinity, so `{{ -5 | divided_by: 3 }}` is `-2`.

## Numbers written in the template

JavaScript has one `number` type, so `5.0 === 5`. LiquidJS therefore decides from what the template wrote: `5.0` is a decimal, `5` is an integer, and a decimal string such as `"2.0"` is a decimal too. The kind survives `assign` and arithmetic, and a decimal renders with its fraction:

Input
```liquid
{% assign n = 7.0 %}{{ n | divided_by: 2 }}
{{ 7 | divided_by: "2.0" }}
{{ 3.5 | times: 2 }}
{{ 7 | divided_by: 2 }}
```

Output
```text
3.5
3.5
7.0
3
```

A number that reaches the template from your JavaScript data carries no kind: `7.0` passed in scope is the integer `7`. To pass a whole-valued decimal, wrap it in a {@link FloatDrop}, exported from the package root: with `{ n: new FloatDrop(7) }`, `{{ n }}` is `7.0` and `{{ n | divided_by: 2 }}` is `3.5`.

## Dividing by zero

Integer division by zero is an error. Once either side is a decimal, the result follows IEEE 754, matching the reference engine:

Input
```liquid
{{ 7 | divided_by: 0.0 }}
{{ -7 | divided_by: 0.0 }}
{{ 0 | divided_by: 0.0 }}
```

Output
```text
Infinity
-Infinity
NaN
```

`{{ 7 | divided_by: 0 }}` raises `divided by 0`. See also [modulo](./modulo.md), which raises for a zero divisor whatever the operands are, and [floor](./floor.md).
