# F140

One Java file in Maven's `src/main/java` layout, read through a `Code` source with no build tool run. `Runner.java`
declares the public top-level class `Runner`; in its body the public interface `Callback`, which holds the enum `Kind`;
the static class `Limits`, which holds `static final int LIMIT = 3`; and the method `run`, whose body declares the
local class `Attempt`. Every type declared in a type's body is declared by its file at any depth, under its dotted name
from the top-level type, so the claims citing TYPE-1 that the file declares `Runner.Callback` and
`Runner.Callback.Kind` hold, as does the claim citing TYPE-2 that it declares `Runner.Limits`. A `static final` field
of a nested type with a literal value is a constant named from that type, so `Runner.Limits.LIMIT` is declared and its
claim holds. A type declared inside a method is not declared, under either its simple name or a dotted one, so the
facts refute both claims citing TYPE-3 that the file declares `Attempt` and `Runner.Attempt`: each is a
`fact-conflict`, verdict `violated`, as the guide says of a claim the facts refute
([architecture rules](../../docs/guides/architecture-rules.md), claims about the code). Exports are unchanged and are
only public top-level types, so the file exports `Runner` and not `Runner.Callback`, though `Callback` is public: the
claim citing API-1 that it exports `Runner.Callback`, stated with `holds: false`, holds. From the Java and Python runs
([14](../../docs/spec/14-from-the-java-and-python-runs.md)), section 1; polyglot code
([12](../../docs/spec/12-polyglot-code.md)), section 3; A-127 and A-170; stage 45.

The expected result was written from the documents before the fixture was first run.
