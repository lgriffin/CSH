# F144

Prevention where the language cannot give it ([14](../../docs/spec/14-assertion-ladder.md), section 4; stage 47).
`app/errors.py` declares `class Code(Enum)` and `STATUS: dict[Code, int]`, a complete mapping today; but no compiler
checks it, so `total(app/errors.py, STATUS, Code)` is unknown, its reason `no-compiler: python`, and never refuted.
`api/status.go` declares a map from a string type to a status; Go has no closed type, so
`total(api/status.go, Status, Code)` is unknown, `no-closed-types: go`.

`R-Y-1` is cited by the Python claim and by the title of a test in `tests/test_errors.py`: it is L3, by the test, and
not L5. `R-G-1` is cited by the Go claim alone: L2, and the gap `unverified`.

The expected result was written from the documents before the fixture was first run.
