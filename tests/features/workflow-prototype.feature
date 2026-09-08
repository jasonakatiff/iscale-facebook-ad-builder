Feature: M0 workflow prototype continuity
  Scenario: Evidence reaches the next test (S01 S02 S03 S05 S06 S07 S08 S09 AT02 AT03 AT16)
    Given visibly labeled sample evidence and no provider connection
    When a buyer creates a brief and prepares three creative variants
    And reviews two headlines, two bodies and two destinations
    Then the review contains 24 paused ads and their evidence history
    And a sample finding becomes the next brief with its source report
    And no application or provider API is called

  Scenario: Connection and interruption clarity (S04 S07 AT01 AT09)
    Given a disconnected provider
    Then deployment controls are hidden and creative work remains accessible
    When a simulated launch has confirmed, unknown and remaining operations
    And the buyer stops remaining work
    Then confirmed objects and unknown results remain visible
    And blind retry is unavailable

  Scenario: Revision and money clarity (S05 S06 AT05 AT06 AT08)
    Given a preview containing two ad-set daily budgets of 19.99 USD
    Then its configured total is exactly 3998 minor units
    When a build changes or a conflicting revision arrives
    Then the preview cannot launch and local edits can be forked

  Scenario: Responsive accessible prototype (S01 S09 AT11 AT12)
    Given the prototype at widths 390, 768 and 1440 in light and dark themes
    Then the workflow remains reachable without page overflow
    And confirmation dialogs preserve keyboard focus
    And every view identifies its data as sample data
