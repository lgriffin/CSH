Feature: Release

  @rule-0001 @ears-event-driven
  Rule: When the SLO file is read, the release shall list each objective.

    Scenario: The objectives are listed
      Given the SLO file committed at release/slo.yaml
      When the objectives are read
      Then 3 objectives are listed

  @rule-0002 @ears-event-driven
  Rule: When a course a generator release wrote is opened, the reader shall load it.

    Scenario Outline: Open the course as generator <release> wrote it
      Given the course that generator "<release>" wrote
      When the reader loads it
      Then the course loads

      Examples:
        | release |
        | 4.1.0   |
        | 5.0.0   |

  @rule-0003 @ears-event-driven
  Rule: When the calendar is seeded, the report shall cover the seeded days.

    Scenario: Seeded days are covered
      Given the calendar holds 10 blocks on each of "2026-03-01, 2026-03-02"
      Then the report covers 2 days
      And the report is archived
