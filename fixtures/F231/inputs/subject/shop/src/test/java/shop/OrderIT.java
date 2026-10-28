package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

class OrderIT {
    @Test
    @Tag("SHOP-1")
    void totalsAnOrder() {
        assertEquals(0, new Order().total());
    }

    @Test
    @DisplayName("CAMEL-11: a new order totals nothing")
    void startsEmpty() {
        assertEquals(0, new Order().total());
    }

    @Test
    @Tag("SHOP-4")
    void keepsItsTotal() {
        assertEquals(0, new Order().total());
    }
}
