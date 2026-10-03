# F05

`shall` returns the JavaScript value `true` instead of an expression. A cast hides it from the compiler; the emitted
IR then holds a raw value where an expression tree is required, which the harness rejects (rule S6). Semantic contract,
section 7.1; main tab, section 7.3.
