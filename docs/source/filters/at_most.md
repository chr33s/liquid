---
title: at_most
---

**Since:** v8.4.0

Limits a number to a maximum value.

Input
```liquid
{{ 4 | at_most: 5 }}
```

Output
```text
4
```

Input
```liquid
{{ 4 | at_most: 3 }}
```

Output
```text
3
```
