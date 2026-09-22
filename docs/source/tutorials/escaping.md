---
title: Escaping
---

Escaping is important in all languages, including LiquidJS. Escaping has two different meanings for a template engine:

1. Escaping for the output, i.e. HTML escape. Used to escape HTML special characters so the output will not break HTML structures, aka HTML safe.
2. Escaping for the language itself, i.e. Liquid escape. Used to output strings that are considered special in the Liquid language. This is useful when you're writing an article in a Liquid template to introduce the Liquid language.

## HTML Escape

By default output is not escaped. While you can use [escape](../filters/escape.md) filter for this:

Input
```liquid
{{ "1 < 2" | escape }}
```

Output
```text
1 &lt; 2
```

There's also [escape_once](../filters/escape.md), [newline_to_br](../filters/newline_to_br.md), [strip_html](../filters/strip_html.md) filters for you to fine tune your output.

In cases where variables are mostly not trusted, [outputEscape](./options.md) can be set to `"escape"` to apply escape by default. In this case, when you need some output not to be escaped, [raw](../tags/raw.md) filter can be used:

Input
```liquid
{{ "1 < 2" }}
{{ "<button>OK</button>" | raw }}
```

Output
```text
1 &lt; 2
<button>OK</button>
```

## Liquid Escape

To disable Liquid language and output strings like `{{` and `{%`, the [raw](../tags/raw.md) tag can be used.

Input
```liquid
{% raw %}
  In LiquidJS, {{ this | escape }} will be HTML-escaped, but
  {{{ that }}} will not.
{% endraw %}
```

Output
```text
In LiquidJS, {{ this | escape }} will be HTML-escaped, but
{{{ that }}} will not.
```

String literals in a LiquidJS template have no escape sequences, as in the reference engine: `"a\nb"` is `a`, a backslash, `n` and `b`. A quote cannot be escaped, so to write one, quote the string with the other kind:

Input
```liquid
{{ '"' }}
{{ "it's" }}
```

Output
```liquid
"
it's
```
