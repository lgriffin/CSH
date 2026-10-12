package com.example.shop;

public abstract sealed class ShopException extends RuntimeException {
    private ShopException(String message) {
        super(message);
    }

    public static final class NotFound extends ShopException {
        public NotFound(String id) {
            super(id);
        }
    }

    public static final class Conflict extends ShopException {
        public Conflict(String id) {
            super(id);
        }
    }
}
