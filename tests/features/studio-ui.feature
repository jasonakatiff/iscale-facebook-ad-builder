Feature: Breadwinner studio appearance
  Scenario: Remember an explicit theme
    Given a signed-in media buyer chooses dark appearance
    When they navigate to campaign creation and reload
    Then dark appearance remains active
    And their campaign draft remains intact

  Scenario: Follow the system appearance
    Given appearance is set to system
    When the operating system changes between light and dark
    Then the app follows that appearance
    But an explicit light or dark preference stays unchanged

  Scenario: Navigate on a phone
    Given the viewport is 390 pixels wide
    When the buyer opens navigation and selects Brands
    Then the Brands page opens without horizontal page overflow
    And the navigation drawer closes

  Scenario: Review destructive actions with a keyboard
    Given the buyer opens the discard-draft confirmation
    Then focus stays within the modal
    When they press Escape
    Then the modal closes and focus returns to its trigger
