---
title: strip_html
---

**Since:** v1.9.1

Removes any HTML tags from a string. As in the reference engine, `<script>`, `<style>` and `<!-- -->` blocks are removed with their contents first, then any remaining `<...>` tag.

> **Not safe for HTML output**
>
> This filter removes tags by string scanning; it does not parse HTML5 the way a browser does, and it is not a sanitizer. The result may still be unsafe when inserted into HTML. Use [escape](./escape.md), [escape_once](./escape.md), or [`outputEscape: "escape"`](../tutorials/options.md) for untrusted output.

Input
```liquid
{{ "Have <em>you</em> read <strong>Ulysses</strong>?" | strip_html }}
```

Output
```text
Have you read Ulysses?
```
