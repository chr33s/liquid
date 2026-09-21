---
title: Filters
description: Description and demo for each Liquid filter
children:
  - ./abs.md
  - ./append.md
  - ./array_to_sentence_string.md
  - ./at_least.md
  - ./at_most.md
  - ./base64_decode.md
  - ./base64_encode.md
  - ./capitalize.md
  - ./ceil.md
  - ./cgi_escape.md
  - ./compact.md
  - ./concat.md
  - ./date.md
  - ./date_to_long_string.md
  - ./date_to_rfc822.md
  - ./date_to_string.md
  - ./date_to_xmlschema.md
  - ./default.md
  - ./divided_by.md
  - ./downcase.md
  - ./escape.md
  - ./escape_once.md
  - ./find.md
  - ./find_exp.md
  - ./find_index.md
  - ./find_index_exp.md
  - ./first.md
  - ./floor.md
  - ./group_by.md
  - ./group_by_exp.md
  - ./has.md
  - ./has_exp.md
  - ./hmac_sha256.md
  - ./inspect.md
  - ./join.md
  - ./json.md
  - ./jsonify.md
  - ./last.md
  - ./lstrip.md
  - ./map.md
  - ./minus.md
  - ./modulo.md
  - ./newline_to_br.md
  - ./normalize_whitespace.md
  - ./number_of_words.md
  - ./plus.md
  - ./pop.md
  - ./prepend.md
  - ./push.md
  - ./raw.md
  - ./reject.md
  - ./reject_exp.md
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
  - ./shift.md
  - ./size.md
  - ./slice.md
  - ./slugify.md
  - ./sort.md
  - ./sort_natural.md
  - ./split.md
  - ./squish.md
  - ./strip.md
  - ./strip_html.md
  - ./strip_newlines.md
  - ./sum.md
  - ./times.md
  - ./to_integer.md
  - ./truncate.md
  - ./truncatewords.md
  - ./uniq.md
  - ./unshift.md
  - ./upcase.md
  - ./uri_escape.md
  - ./url_decode.md
  - ./url_encode.md
  - ./where.md
  - ./where_exp.md
  - ./xml_escape.md
---

LiquidJS implements business-logic independent filters that are typically implemented in [shopify/liquid][shopify/liquid]. This section contains the specification and demos for all the filters implemented by LiquidJS.

There are 40+ filters supported by LiquidJS. These filters can be categorized into these groups:

Categories | Filters
--- | ---
Math | `plus`, `minus`, `modulo`, `times`, `floor`, `ceil`, `round`, `divided_by`, `abs`, `at_least`, `at_most`
String | `append`, `prepend`, `capitalize`, `upcase`, `downcase`, `strip`, `lstrip`, `rstrip`, `strip_newlines`, `split`, `replace`, `replace_first`, `replace_last`,`remove`, `remove_first`, `remove_last`, `truncate`, `truncatewords`, `normalize_whitespace`, `number_of_words`, `array_to_sentence_string`
HTML/URI | `escape`, `escape_once`, `url_encode`, `url_decode`, `strip_html`, `newline_to_br`, `xml_escape`, `cgi_escape`, `uri_escape`, `slugify`
Array | `slice`, `map`, `sort`, `sort_natural`, `uniq`, `where`, `where_exp`, `group_by`, `group_by_exp`, `find`, `find_exp`, `first`, `last`, `join`, `reverse`, `concat`, `compact`, `size`, `push`, `pop`, `shift`, `unshift`
Date | `date`, `date_to_xmlschema`, `date_to_rfc822`, `date_to_string`, `date_to_long_string`
Misc | `default`, `json`, `jsonify`, `inspect`, `raw`, `to_integer`
Base64 | `base64_encode`, `base64_decode`
Crypto | `sha256`, `hmac_sha256`

[shopify/liquid]: https://github.com/Shopify/liquid
