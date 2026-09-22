---
title: Filters
description: Description and demo for each Liquid filter
children:
  - ./abs.md
  - ./append.md
  - ./at_least.md
  - ./at_most.md
  - ./base64_decode.md
  - ./base64_encode.md
  - ./base64_url_safe_decode.md
  - ./base64_url_safe_encode.md
  - ./capitalize.md
  - ./ceil.md
  - ./compact.md
  - ./concat.md
  - ./date.md
  - ./default.md
  - ./divided_by.md
  - ./downcase.md
  - ./escape.md
  - ./escape_once.md
  - ./find.md
  - ./find_index.md
  - ./first.md
  - ./floor.md
  - ./h.md
  - ./has.md
  - ./hmac_sha256.md
  - ./join.md
  - ./json.md
  - ./last.md
  - ./lstrip.md
  - ./map.md
  - ./minus.md
  - ./modulo.md
  - ./newline_to_br.md
  - ./plus.md
  - ./prepend.md
  - ./reject.md
  - ./remove.md
  - ./remove_first.md
  - ./remove_last.md
  - ./replace.md
  - ./replace_first.md
  - ./replace_last.md
  - ./reverse.md
  - ./round.md
  - ./rstrip.md
  - ./sha256.md
  - ./size.md
  - ./slice.md
  - ./sort.md
  - ./sort_natural.md
  - ./split.md
  - ./squish.md
  - ./strip.md
  - ./strip_html.md
  - ./strip_newlines.md
  - ./sum.md
  - ./times.md
  - ./truncate.md
  - ./truncatewords.md
  - ./uniq.md
  - ./upcase.md
  - ./url_decode.md
  - ./url_encode.md
  - ./where.md
---

LiquidJS implements the filters of the reference [shopify/liquid][shopify/liquid] engine. This section contains the specification and demos for each of them.

These filters are available in both profiles:

Categories | Filters
--- | ---
Math | `plus`, `minus`, `modulo`, `times`, `floor`, `ceil`, `round`, `divided_by`, `abs`, `at_least`, `at_most`
String | `append`, `prepend`, `capitalize`, `upcase`, `downcase`, `strip`, `lstrip`, `rstrip`, `strip_newlines`, `squish`, `split`, `replace`, `replace_first`, `replace_last`, `remove`, `remove_first`, `remove_last`, `truncate`, `truncatewords`
HTML/URI | `escape`, `escape_once`, `h`, `url_encode`, `url_decode`, `strip_html`, `newline_to_br`
Array | `slice`, `map`, `sort`, `sort_natural`, `uniq`, `where`, `reject`, `has`, `find`, `find_index`, `first`, `last`, `join`, `reverse`, `concat`, `compact`, `size`, `sum`
Date | `date`
Misc | `default`
Base64 | `base64_encode`, `base64_decode`, `base64_url_safe_encode`, `base64_url_safe_decode`

The [Shopify theme profile](../tutorials/shopify-theme-profile.md) adds the hosted crypto (including `sha256` and `hmac_sha256`), string, color, HTML, localization, money, media, asset and commerce filters, and `json`, on top of these. `buildCompatibilityManifest()` reports exactly which names a build carries.

[shopify/liquid]: https://github.com/Shopify/liquid
