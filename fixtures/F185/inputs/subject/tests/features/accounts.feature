Feature: Accounts

  Scenario: REQ-ACC-001 A member signs in
    Given a member account
    When the member signs in
    Then the member sees their page

  Scenario: REQ-ACC-002 A member signs out
    Given a member account
    When the member signs out
    Then the member sees the home page
