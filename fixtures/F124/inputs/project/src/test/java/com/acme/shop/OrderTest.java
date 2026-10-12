package com.acme.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class OrderTest {
    @Test
    void totalsTheLines_REQ_1() {
        assertEquals(3, new Order(new long[] {1, 2}).total());
    }

    @Test
    void rejectsNegative_REQ_2() {
        assertTrue(new Order(new long[] {-1}).isRefused());
    }
}
