# F165

One repository with five small services, one per language (TypeScript, Python, Java, Go, Rust), read cold. Each
requirement names the terms it constrains in backticks, and a test in its service cites it by name. Every citing test
observes one of its requirement's terms and not the other: `GRN-1` constrains `attempts` and `window` and its test
observes `attempts` only, and so on in each language. Each such requirement is a gap of the kind unobserved terms,
whose detail names the terms no citing test observes and the reader that read the test; it is masked danger of the
shape citation without observation, since the citation reads as assurance (L3) over terms the test never reaches. The
rung stays L3. `GRN-6` constrains `attempts`, which its test observes: no gap. Analyse, danger and grain, section 4
([16](../../docs/spec/16-analyse-danger-grain.md)); exit of stage 57.
