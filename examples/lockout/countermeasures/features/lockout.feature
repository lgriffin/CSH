# Agreed with the product owner and the tester. Each tag names the requirement a scenario illustrates.
Feature: Sign-in lockout

  @LCK-001
  Scenario: Third failed attempt locks the account
    Given the account has 2 failed attempts
    And the account is not locked
    When the user signs in with the wrong password
    Then the sign-in is refused
    And the account is locked

  @LCK-001
  Scenario: The lock lasts fifteen minutes
    Given the account has 2 failed attempts
    And the account is not locked
    When the user signs in with the wrong password
    Then the account is locked for 15 minutes

  @LCK-002
  Scenario: A locked account is refused even with the correct password
    Given the account is locked
    When the user signs in with the correct password
    Then the sign-in is refused

  @LCK-003
  Scenario: A successful sign-in clears the failed attempts
    Given the account has 2 failed attempts
    And the account is not locked
    When the user signs in with the correct password
    Then the sign-in is accepted
    And the account has 0 failed attempts

  Scenario: Support unlocks a locked account
    Given the account is locked
    When a support agent unlocks the account
    Then the user can sign in again
