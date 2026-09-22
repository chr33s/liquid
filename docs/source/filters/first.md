---
title: first
---

**Since:** v1.9.1

Returns the first item of an array.

Input
```liquid
{{ "Ground control to Major Tom." | split: " " | first }}
```

Output
```text
Ground
```

Input
```liquid
{% assign my_array = "zebra, octopus, giraffe, tiger" | split: ", " %}
{{ my_array.first }}
```

Output
```text

zebra
```

You can use `first` with dot notation when you need to use the filter inside a tag:

```liquid
{% if my_array.first == "zebra" %}
  Here comes a zebra!
{% endif %}
```

On a hash, `first` returns the first entry as a `[key, value]` pair, and so does `hash.first` unless the hash has a key named `first`. On a string, both return the first character.
