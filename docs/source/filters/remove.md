---
title: remove
---

**Since:** v1.9.1

Removes every occurrence of the specified substring from a string.

Input
```liquid
{{ "I strained to see the train through the rain" | remove: "rain" }}
```

Output
```text
I sted to see the t through the
```
