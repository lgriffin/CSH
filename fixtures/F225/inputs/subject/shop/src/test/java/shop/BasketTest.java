package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class BasketTest {
    // A Receipt prints the basket; see ReceiptDoc.
    @Test
    void holdsWhatIsAdded() {
        Basket b = new Basket();
        b.add("tea");
        assertEquals(1, b.size());
    }
}
