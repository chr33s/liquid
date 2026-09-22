---
title: replace
---

**Since:** v1.9.1

Replaces every occurrence of the first argument in a string with the second argument.

Input
```liquid
{{ "Take my protein pills and put my helmet on" | replace: "my", "your" }}
```

Output
```text
Take your protein pills and put your helmet on
```

The replacement reads Ruby's backslash escapes: `\0` and `\&` insert the matched text, `` \` `` and `\'` the text before and after the match, and `\\` a single backslash.

Input
```liquid
{{ "abc" | replace: "b", "[\0]" }}
```

Output
```text
a[b]c
```
