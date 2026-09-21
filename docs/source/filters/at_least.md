---
title: at_least
---

**Since:** v8.4.0

Limits a number to a minimum value.

Input
```liquid
{{ 4 | at_least: 5 }}
```

Output
```text
5
```

Input
```liquid
{{ 4 | at_least: 3 }}
```

Output
```text
4
```
