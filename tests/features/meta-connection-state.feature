Feature: Accurate Meta connection state (FR03 S04 AT01)
  Scenario: Managed connection is labeled honestly
    Given an authenticated user with no active personal grant and a configured server token
    When the user visits Facebook Campaigns
    Then the card says Connected through workspace
    And campaign controls use that effective credential
    And no personal Disconnect action is offered

  Scenario: Disconnected and expired states never initialize campaign controls
    Given missing credentials or an expired personal grant
    When the user visits Facebook Campaigns
    Then no campaign provider, draft controls or account requests are mounted
    And creative work remains available
    And an expired personal grant cannot call Meta through the API

  Scenario: Connection changes retain draft scope
    Given two personally authorized accounts and an existing account draft
    When the user selects that account
    Then the account draft is restored
    When the user disconnects and a managed fallback exists
    Then the card reports the effective managed connection
    And the prior personal draft remains stored under its original scope

  Scenario: Network failure is visible and recoverable
    Given a failed connection-status request
    Then an inline retry action is visible and campaign controls stay hidden
    When a newer refresh succeeds
    Then an older response cannot replace the selected connection
