package grain;

import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;

class QuotaTest {
    @Test
    void GRN_3_refusesOverQuota() {
        int quota = 1;
        Quota q = new Quota(quota, 60);
        q.admit();
        assertFalse(q.admit());
    }
}
