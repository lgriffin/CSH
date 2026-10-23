Feature: Cart

  Scenario: REQ-CART-001 Adding an item
    Given a basket holding 3 items
    When the member adds "socks"
    Then the basket holds 4 items and "socks" is the last

  Scenario: REQ-CART-002 Emptying the basket
    Given a basket holding 2 items
    When the member empties the basket
    Then the basket is empty for good

  Scenario: REQ-CART-003 A guest empties the basket
    Given a guest at the door
    And a basket holding 1 items
    When the member empties the basket
    Then the basket is empty
