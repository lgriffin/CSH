# F213

Java approved files ([21](../../docs/spec/21-test-suites-as-evidence.md), section 2; stage 70).

ApprovalTests keeps `X.m.approved.txt` beside the test class `X`. `InvoiceTest.java` has two approved files, so one
case with two outputs converges. `ReceiptTest.prints.approved.txt` has no sibling test class. ApprovalTests can be told
to keep approved files elsewhere, so it is unpaired, not an orphan.

The expected result was written from the specification before the code.
