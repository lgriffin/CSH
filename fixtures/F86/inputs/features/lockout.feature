Feature: Sign-in lockout

  @LCK-001
  Scenario: Third failed attempt locks the account
    Given the account has 2 failed attempts
    And the account is not locked
    When the user signs in with the wrong password
    Then the sign-in is refused
    And the account is locked

  Scenario: Support unlocks a locked account
    Given the account is locked
    When a support agent unlocks the account
    Then the user can sign in again
