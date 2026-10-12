# Shop architecture rules

| ID | Rule |
| --- | --- |
| ARCH-1 | THE domain SHALL import no adapter. |
| ARCH-2 | THE ports SHALL import no adapter. |
| ERR-1 | THE OrderNotFound error SHALL be an Exception. |
| ERR-2 | THE OrderRecord class SHALL be a pydantic BaseModel. |
