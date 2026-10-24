package shop;

import org.approvaltests.Approvals;
import org.junit.jupiter.api.Test;

class ReceiptTest {
    @Test
    void printsTotal() {
        Approvals.verify(new Receipt().print(7));
    }
}
