package com.acme.shop.web;

import com.acme.shop.domain.Order;

public class OrderController {
  public Order show() {
    return new Order();
  }
}
