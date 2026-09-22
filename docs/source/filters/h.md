---
title: h
---

**Since:** v12.0.0

An alias of [escape](./escape.md): replaces HTML special characters with escape sequences.

Input
```liquid
{{ "<b>bold</b>" | h }}
```

Output
```text
&lt;b&gt;bold&lt;/b&gt;
```
