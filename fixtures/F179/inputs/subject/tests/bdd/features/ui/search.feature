Feature: Search
  Reader behaviour that needs a browser is proved by Playwright: one test per scenario, titled and tagged to match.

  @rule-0001 @ears-event-driven
  Rule: When a student searches a course, the reader shall list each match.

    Scenario: Search matches every word
      Given the course is open
      When the student searches for "mermaid zipped"
      Then each match is listed

  @rule-0002 @ears-event-driven
  Rule: When a student clears the search box, the reader shall list nothing.

    Scenario: Clearing the box empties the list
      Given the course is open
      When the student clears the box
      Then nothing is listed
