package com.acme.shop.adapters;

import com.acme.shop.domain.Order;
import com.acme.shop.ports.OrderRepository;
import org.springframework.jdbc.core.support.JdbcDaoSupport;

public class JdbcOrderRepository extends JdbcDaoSupport implements OrderRepository {
    @Override
    public void add(Order order) {
        getJdbcTemplate().update("insert into orders values (?, ?)", order.id(), order.total());
    }
}
