package com.acme.ledger.ui;

import java.sql.SQLException;

public class LedgerView {
    public String describe(SQLException error) {
        return "The ledger could not be loaded: " + error.getMessage();
    }
}
