Feature: BreadWinner TikTok campaign loading
  Scenario: Open an already connected advertiser
    Given a TikTok advertiser connection exists
    When the TikTok Ads page opens
    Then campaigns for the last 30 days appear without creating a campaign

  Scenario: Change the reporting period
    Given a connected advertiser has campaigns displayed
    When the operator selects Last 7 Days
    Then campaigns reload for the last 7 days

  Scenario: No connected advertiser
    Given no TikTok advertiser is connected
    When the TikTok Ads page opens
    Then no campaign request is sent

  Scenario: Switch advertisers
    Given a connected advertiser has campaigns displayed
    When the operator selects a different advertiser
    Then campaigns reload for the selected advertiser

  Scenario: Campaign request fails
    Given a TikTok advertiser connection exists
    When loading campaigns fails with a network error
    Then an error notification appears and loading ends
