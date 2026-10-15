# Search

These scenarios are specification prose, not executed. They state what search shall show for content shapes the bound
feature does not cover yet.

```gherkin
  Scenario: Search shows the line of single-line content
    Given a note whose whole content is one line
    Then the result shows that line

  Scenario: Search shows each occurrence
    Given a note with three matches
    Then each result shows its own line
```
