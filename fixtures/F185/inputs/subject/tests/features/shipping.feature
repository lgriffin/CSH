Feature: Shipping

  Scenario: REQ-SHP-001 A stored order ships
    Given a stored order
    When the order ships
    Then the member is told
