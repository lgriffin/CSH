package com.example.shop;

class Phases {
    static String label(Phase p) {
        return switch (p) {
            case OPEN -> "open";
            case CLOSED -> "closed";
        };
    }
}
