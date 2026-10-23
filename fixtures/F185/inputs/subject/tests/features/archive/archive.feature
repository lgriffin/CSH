Feature: Archive

  Scenario: REQ-ARC-001 An archived order is kept
    Given an archived order
    Then the order is kept
