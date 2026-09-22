---
title: raw
---

Since v9.37.0.

Liquid filter that directly returns the value of the variable. Useful when {@link LiquidOptions.outputEscape} is set.

**Auto escape**


By default `outputEscape` is not set. That means LiquidJS output is not escaped by default, thus `raw` filter is not useful until `outputEscape` is set.


Input (`outputEscape` not set)
```liquid
{{ "<" }}
```

Output
```text
<
```

Input (`outputEscape="escape"`)
```liquid
{{ "<" }}
```

Output
```text
&lt;
```

Input (`outputEscape="json"`)
```liquid
{{ "<" }}
```

Output
```text
"<"
```

Input (`outputEscape="escape"`)
```liquid
{{ "<" | raw }}
```

Output
```text
<
```
