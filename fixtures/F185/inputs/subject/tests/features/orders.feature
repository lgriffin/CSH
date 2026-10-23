Feature: Orders

  Scenario: REQ-ORD-001 A placed order is stored
    Given an empty basket
    When the member places an order
    Then the order is stored

  @pending
  Scenario: REQ-ORD-002 A member cancels an open order
