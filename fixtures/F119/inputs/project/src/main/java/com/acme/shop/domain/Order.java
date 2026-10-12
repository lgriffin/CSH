package com.acme.shop.domain;

import com.acme.shop.adapters.JdbcOrderRepository;
import java.util.Objects;

public final class Order {
    private final String id;
    private final long total;

    public Order(String id, long total) {
        this.id = Objects.requireNonNull(id);
        this.total = total;
    }

    public String id() {
        return id;
    }

    public long total() {
        return total;
    }

    public void save(JdbcOrderRepository repository) {
        repository.add(this);
    }
}
