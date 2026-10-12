# F142

A Python package `app` with a subpackage `app/core`, read through a `Code` source with nothing installed. Line 1 of
`app/core/updater.py` is `from PySide6.QtCore import QObject, QThread, Signal`. No file read holds `PySide6`, it is not
a standard library module and no top-level name of the source is `PySide6`, so the facts record the dependency by its
top-level package, `PySide6` (A-130; [12](../../docs/spec/12-polyglot-code.md), section 3).

`modules("PySide6.*")` ends in `.*`, so it also selects `PySide6`, and `CoreUsesNoQt` (ARCH-1) is violated with the
importing file and line as its reason (A-171). `modules("PySide6.QtWidgets")` does not select `PySide6`, but its text
starts with `PySide6.`, so it names part of a name the facts record whole: CSH cannot tell whether the core uses
`QtWidgets`, so `CoreUsesNoWidgets` (ARCH-2), which no dependency violates, is unknown with the reason
`finer-than-facts`, naming the selector and giving the dependency's file and line, and is not held (A-172). This is the
example of section 2, over `QtCore`.

`Signals` is defined directly in the body of the class `Updater`, so it is declared as `Updater.Signals` and the claim
citing CODE-1 holds. `Probe` is defined inside the method `run`, and a class defined inside a function is not
declared, under its simple name or a dotted one, so the facts refute both claims citing CODE-2: each is a
`fact-conflict`, verdict `violated`, as the guide says of a claim the facts refute
([architecture rules](../../docs/guides/architecture-rules.md), claims about the code) (A-170). From the Java and Python
runs ([14](../../docs/spec/14-from-the-java-and-python-runs.md)), sections 1 and 2; stage 45.

The expected result was written from the documents before the fixture was first run.
