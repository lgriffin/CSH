package com.acme.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CartTest {
    @Test
    @DisplayName("REQ-1 adds an item")
    void addsAnItem() {
        assertEquals(1, new Cart().add(1).size());
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3})
    @Tag("REQ-2")
    void acceptsPositiveQuantities(int qty) {
        assertTrue(new Cart().accepts(qty));
    }

    @Test
    void refusesNegativeQuantities_REQ_4() {
        assertTrue(new Cart().refuses(-1));
    }

    private static Cart emptyCart_REQ_9() {
        return new Cart();
    }
}
