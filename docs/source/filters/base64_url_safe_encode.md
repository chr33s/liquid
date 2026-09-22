---
title: base64_url_safe_encode
---

**Since:** v12.0.0

Encodes a string to URL-safe Base64: `+` and `/` become `-` and `_`, and the `=` padding is kept, as in Ruby's `Base64.urlsafe_encode64`.

Input
```liquid
{{ "a?b>c" | base64_url_safe_encode }}
```

Output
```text
YT9iPmM=
```

Decode it again with [base64_url_safe_decode](./base64_url_safe_decode.md).
