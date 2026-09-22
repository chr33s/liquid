---
title: base64_url_safe_decode
---

**Since:** v12.0.0

Decodes a URL-safe Base64 string. Input that is not valid URL-safe Base64 raises an argument error rather than decoding silently.

Input
```liquid
{{ "YT9iPmM" | base64_url_safe_decode }}
```

Output
```text
a?b>c
```
