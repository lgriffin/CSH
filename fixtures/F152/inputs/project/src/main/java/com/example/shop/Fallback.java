package com.example.shop;

class Fallback {
    static String label(Status s) {
        return switch (s) {
            case OPEN -> "open";
            default -> "other";
        };
    }
}
