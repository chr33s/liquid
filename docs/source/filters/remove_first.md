---
title: remove_first
---

**Since:** v1.9.1

Removes only the first occurrence of the specified substring from a string.

Input
```liquid
{{ "I strained to see the train through the rain" | remove_first: "rain" }}
```

Output
```text
I sted to see the train through the rain
```
