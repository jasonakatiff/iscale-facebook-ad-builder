Feature: Breadwinner feedback board
  Scenario: Review precedes publishing
    Given a configured campaign, ad set, and creative variants
    When the buyer continues from Bulk Ads
    Then every outgoing setting is available on Review & Launch
    And no Facebook object has been created
    When the buyer confirms creation on the review screen
    Then campaign, ad set, and ads are created PAUSED

  Scenario: Objective and validation
    When the buyer changes Sales to Leads
    Then the conversion event resets to LEAD
    And incompatible optimization and conversion events cannot be published
    And missing fields display named validation errors

  Scenario: Account schedule and budget
    Given an ad account in America/New_York
    When a buyer in another timezone enters 2026-09-10 01:00
    Then Facebook receives 2026-09-10T05:00:00Z
    And a budget below the account minimum blocks progress

  Scenario: Targeting round trip
    When the buyer includes United States and excludes California
    And selects Facebook Feed and Instagram Stories
    And includes a lookalike and excludes a customer audience
    Then those exact selections reach Facebook without display-only fields

  Scenario: Identity and attribution
    Given hundreds of accessible Facebook Pages
    Then no Page is selected automatically
    And the buyer can search Pages alphabetically and choose an Instagram account
    And special ad categories and URL parameters appear in the publish review

  Scenario: Creative variants
    Given two media files, two nonempty headlines, and two nonempty bodies
    Then eight editable ads are generated
    And default ad names omit filename extensions and spaces
    And returning from review preserves edited ad names

  Scenario: Reusable settings
    When a buyer saves a vertical preset for one ad account
    Then it can be loaded, updated, and deleted
    And another user's settings remain inaccessible
    And applying the preset to another account cannot reuse its Page or pixel

  Scenario: Draft recovery
    Given a wizard containing uploaded media and edited ad names
    When the browser reloads
    Then the draft, current step, and media files can be restored
    And no token is stored in the draft

  Scenario: Accounts and activity
    When the buyer reopens the account step within one hour
    Then cached accounts appear and Sync refreshes them
    And existing campaigns appear in recent dashboard activity

  Scenario: Existing integration contracts
    Given the team's image model and naming generator contracts
    When their configured integrations are selected
    Then the real integrations generate images and standardized names
    And unavailable integration configuration produces an actionable error
