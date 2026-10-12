package com.acme.ledger.core;

import java.util.List;

public class Ledger {
    private final List<Long> entries;

    public Ledger(List<Long> entries) {
        this.entries = entries;
    }

    public long balance() {
        long total = 0;
        for (long entry : entries) {
            total += entry;
        }
        return total;
    }
}
