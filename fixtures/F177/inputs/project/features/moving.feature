Feature: Moving cards

  @REQ-1
  Scenario: A card moves along the board
    Given a board with 3 cards
    When a card moves to done
    Then the board holds 3 cards
    And the move is logged
