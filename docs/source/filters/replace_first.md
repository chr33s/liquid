---
title: replace_first
---

**Since:** v1.9.1

Replaces only the first occurrence of the first argument in a string with the second argument.

Input
```liquid
{{ "Take my protein pills and put my helmet on" | replace_first: "my", "your" }}
```

Output
```text
Take your protein pills and put my helmet on
```

The replacement reads Ruby's backslash escapes: `\0` and `\&` insert the matched text, `` \` `` and `\'` the text before and after the match, and `\\` a single backslash. See [replace](./replace.md).
