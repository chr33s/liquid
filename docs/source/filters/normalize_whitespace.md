---
title: normalize_whitespace
---

Since v10.13.0.

Replace any occurrence of whitespace with a single space.

Input
```liquid
{{ "a \n b" | normalize_whitespace }}
```

Output
```html
a b
```
