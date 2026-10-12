Feature: Refunds

  Scenario: Refund a paid order
    Given a paid order
    When the shopper asks for a refund
    Then the order is refunded
