package com.example.shop;

class Legacy {
    static String label(Status s) {
        String out = "";
        switch (s) {
            case OPEN:
                out = "open";
                break;
            case CLOSED:
                out = "closed";
                break;
        }
        return out;
    }
}
