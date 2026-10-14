package com.acme.board.steps;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

public class MovingSteps {
  @Given("a board with {int} cards")
  public void aBoardWith(int cards) {}

  @When("^a card moves to (\\w+)$")
  public void aCardMovesTo(String column) {}

  @Then("the board holds {int} cards")
  public void theBoardHolds(int cards) {}
}
