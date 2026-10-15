Feature: Course

  @rule-0003 @ears-event-driven
  Rule: When a student opens a course, the reader shall show its title.

    Scenario: Opening shows the title
      Given the course is open
      Then the title is shown
