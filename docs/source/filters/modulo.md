---
title: modulo
---

**Since:** v1.9.1

Returns the remainder of a division operation.

Input
```liquid
{{ 3 | modulo: 2 }}
```

Output
```text
1
```

Input
```liquid
{{ 24 | modulo: 7 }}
```

Output
```text
3
```

Input
```liquid
{{ 183.357 | modulo: 12 }}
```

Output
```text
3.3569999999999993
```

The result is floored, so it takes the divisor's sign:

Input
```liquid
{{ -5 | modulo: 3 }}
{{ 5 | modulo: -3 }}
```

Output
```text
1
-1
```

Unlike [divided_by](./divided_by.md), a zero divisor is always an error, whether it is written as `0` or `0.0`.
