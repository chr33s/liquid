---
title: truncatewords
---

**Since:** v1.9.1

Shortens a string down to the number of words passed as an argument. If the specified number of words is less than the number of words in the string, an ellipsis (...) is appended to the string.

Input
```liquid
{{ "Ground control to Major Tom." | truncatewords: 3 }}
```

Output
```text
Ground control to...
```

### Custom ellipsis

`truncatewords` takes an optional second argument that specifies the sequence of characters to be appended to the truncated string. By default this is an ellipsis (...), but you can specify a different sequence.

Input
```liquid
{{ "Ground control to Major Tom." | truncatewords: 3, "--" }}
```

Output
```text
Ground control to--
```

### No ellipsis

You can avoid showing trailing characters by passing a blank string as the second argument:

Input
```liquid
{{ "Ground control to Major Tom." | truncatewords: 3, "" }}
```

Output
```text
Ground control to
```

### Nil and arguments

`nil` input stays `nil`. Words are split on ASCII whitespace only, so a non-breaking space does not end a word. The word count is read like Ruby's `Integer()`: a decimal like `2.9` or a string like `"x"` raises `invalid integer`.
