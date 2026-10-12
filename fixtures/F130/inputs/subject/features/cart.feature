Feature: Cart

  @rule-1 @REQ-1
  Rule: The cart holds what is added

    Scenario: Add one item
      Given an empty cart
      When the shopper adds a book
      Then the cart holds 1 item

  @rule-2 @REQ-2
  Rule: The cart totals its items

    Scenario: Total two items
      Given an empty cart
      When the shopper adds a book
      And the shopper adds a pen
      Then the total is 12
