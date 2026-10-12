package com.example.shop;

class Labels {
    static String label(Status s) {
        return switch (s) {
            case OPEN -> "open";
            case CLOSED -> "closed";
        };
    }
}
