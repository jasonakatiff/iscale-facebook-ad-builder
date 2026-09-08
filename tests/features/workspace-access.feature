Feature: Explicit workspace access and persistent account synchronization
  Scenario: A workspace role never substitutes for an account grant
    Given a member and an account in the same workspace
    When the member has no active account grant
    Then cached reads and synchronization are denied without account details

  Scenario: Membership revocation stops a pending refresh
    Given a buyer requested an authorized refresh
    When the membership is revoked between provider pages
    Then no later provider page is fetched and no snapshot is published

  Scenario: Complete snapshots survive a provider outage
    Given a successful campaign snapshot
    When the next refresh fails on a later page
    Then the last complete generation remains visible as stale with a safe error

  Scenario: Concurrent refresh requests coalesce durably
    Given multiple API processes requesting the same account resource
    When workers claim the queued job
    Then one job and one live lease exist and an obsolete lease cannot publish

  Scenario: Legacy ownership remains explicit
    Given existing brands without workspace ownership
    When the additive migration runs
    Then legacy rows remain unassigned and unchanged
