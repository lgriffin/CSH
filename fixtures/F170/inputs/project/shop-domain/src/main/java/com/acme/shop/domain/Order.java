package com.acme.shop.domain;

import com.acme.shop.db.OrderTable;

public class Order {
  public String table() {
    return OrderTable.NAME;
  }
}
