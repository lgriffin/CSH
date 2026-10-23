package demo;

import org.approvaltests.Approvals;
import org.junit.jupiter.api.Test;

class InvoiceTest {
    @Test
    void rendersTotals() {
        Approvals.verify(new Invoice().render());
    }

    @Test
    void rendersLines() {
        Approvals.verify(new Invoice().render());
    }
}
