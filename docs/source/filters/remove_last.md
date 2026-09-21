---
title: remove_last
---

**Since:** v10.2.0

Removes only the last occurrence of the specified substring from a string.

Input
```liquid
{{ "I strained to see the train through the rain" | remove_last: "rain" }}
```

Output
```text
I strained to see the train through the
```
