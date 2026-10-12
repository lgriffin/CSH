# Shop architecture rules

| ID | Rule |
| --- | --- |
| ARCH-1 | THE domain SHALL import no adapter. |
| ARCH-2 | THE ports SHALL import no adapter. |
| ERR-1 | THE OrderNotFoundException SHALL be an Exception. |
| ERR-2 | THE JdbcOrderRepository SHALL be a Spring DaoSupport. |
