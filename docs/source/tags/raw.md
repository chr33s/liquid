---
title: raw
---

**Since:** v1.9.1

Raw temporarily disables tag processing. This is useful for generating content
(eg, Mustache, Handlebars) which uses conflicting syntax.

Input
```liquid
{% raw %}
  In Handlebars, {{ this }} will be HTML-escaped, but
  {{{ that }}} will not.
{% endraw %}
```

Output
```text
In Handlebars, {{ this }} will be HTML-escaped, but {{{ that }}} will not.
```

The `raw` tag takes no arguments: `{% raw x %}` raises `Syntax Error in 'raw' - Valid syntax: raw`. Whitespace control on the closing tag, `{%- endraw -%}`, is recognized.
