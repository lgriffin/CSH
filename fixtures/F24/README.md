# F24

The witness adapter receives a record whose pre-state carries a key, `overdraftLimitMinor`, that no binding names.
It cannot lift that record and reports it as unliftable with reason unknown-term and its source span. The gap view
lists it as unliftable for the event, not as silence. Semantic contract, section 7.3; Evidence tab, sections 4 and 5.
