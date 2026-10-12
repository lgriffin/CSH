package com.acme.shop.domain;

public class OrderNotFoundException extends DomainException {
    public OrderNotFoundException(String id) {
        super("no order " + id);
    }
}
