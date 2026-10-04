# Store architecture rules

| ID | Rule |
| --- | --- |
| ARCH-001 | THE core package SHALL import no package of the web container. |
| ARCH-002 | THE web container SHALL import only the core and db packages. |
| ARCH-003 | THE container diagram SHALL draw every dependency between containers. |
