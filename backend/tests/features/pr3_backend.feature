Feature: PR3 backend deployment safety
  Scenario: Upgrade the owner's existing Railway schema
    Given upstream tables stamped at add_page_fields_001 with a plaintext refresh row
    When the application upgrades to Alembic head
    Then all four platform and bot tables exist
    And the plaintext row remains with a null token_hash
    And old refresh credentials return 401 while a new login and refresh return 200

  Scenario: Bootstrap an empty database
    Given an empty PostgreSQL database
    When bootstrap_database runs
    Then the current schema exists and is stamped at the new head

  Scenario: Reject an OAuth callback from another browser
    Given a valid signed provider state
    When its browser cookie is missing or differs from the state
    Then the callback returns 400 without calling the provider
    And the callback expires the OAuth cookie
