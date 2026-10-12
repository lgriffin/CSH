Feature: Checkout
  Decisions: ADR-1, see docs/adr/0001-events.md

  Background:
    Given a cart with 2 items

  @R-1 @REQ-1
  Rule: When the shopper pays, the system shall record the order.

    Scenario: Paying records the order
      When the shopper pays "card"
      Then the order is recorded

    Scenario Outline: Totals
      When the shopper adds <n> items
      Then the total is <total>

      Examples:
        | n | total |
        | 1 | 10    |
        | 3 | 30    |

  @R-2
  Rule: When the shopper cancels, the system shall release the cart.
    Specified by: ADR-1
