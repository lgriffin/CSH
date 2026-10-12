package com.example.shop;

import com.example.shop.ShopException.Conflict;
import com.example.shop.ShopException.NotFound;

class Handler {
    int status(ShopException error) {
        return switch (error) {
            case NotFound e -> 404;
            case Conflict e -> 409;
        };
    }
}
