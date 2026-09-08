Feature: Preserve upstream functionality through the studio refresh
  Scenario: Platform features remain reachable
    Given I sign in to the current public application
    Then Overview, Google Ads, and TikTok Ads remain in navigation
    And each platform page retains its account connection controls
    And Facebook retains its connection controls and campaign review workflow
