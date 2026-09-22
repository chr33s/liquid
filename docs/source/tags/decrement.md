---
title: decrement
---

**Since:** v1.9.1

Creates a new number variable, and decreases its value by one every time it is called. The first value is `-1`.

Input
```liquid
{% decrement variable %}
{% decrement variable %}
{% decrement variable %}
```

Output
```text
-1
-2
-3
```

Like [increment](./increment.md), variables declared inside `decrement` are independent from variables created through [assign](./assign.md) or [capture](./capture.md).
