---
title: case
---

**Since:** v1.9.1

Creates a switch statement to compare a variable with different values. `case` initializes the switch statement, and `when` tags compare values.

Input
```liquid
{% assign handle = "cake" %}
{% case handle %}
  {% when "cake" %}
     This is a cake
  {% when "cookie", "biscuit" %}
     This is a cookie
  {% else %}
     This is neither a cake nor a cookie
{% endcase %}
```

Output
```text
This is a cake
```

As in the reference engine, every matching `when` renders, not just the first, and so does every matching value of one `when`: `{% case 1 %}{% when 1, 1 %}a{% endcase %}` renders `aa`. An `else` renders when no `when` before it has matched, and a `case` may hold more than one `else`:

Input
```liquid
{% case 2 %}{% else %}x{% when 1 %}a{% else %}c{% endcase %}
```

Output
```text
xc
```

Under `errorMode: "strict2"`, text after `else` is rejected with `Syntax Error in tag 'case' - Valid else condition: {% else %} (no parameters) `.
