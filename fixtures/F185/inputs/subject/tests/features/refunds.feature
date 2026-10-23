Feature: Refunds

  Scenario: REQ-REF-001 An officer approves a refund
    Given a stored order
    When an officer approves a refund
    Then the refund is recorded

  Scenario: REQ-REF-002 An officer denies a refund
    Given a stored order
    When an officer denies a refund
    Then no refund is recorded

  @pending
  Scenario: REQ-REF-003 A partial refund is recorded
