package com.example.shop;

class Either {
    static String label() {
        return switch (Current.get()) {
            case OPEN -> "open";
            case CLOSED -> "closed";
        };
    }
}
