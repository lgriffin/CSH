package com.acme.shop.ports;

import com.acme.shop.domain.Order;

public interface OrderRepository {
    void add(Order order);
}
