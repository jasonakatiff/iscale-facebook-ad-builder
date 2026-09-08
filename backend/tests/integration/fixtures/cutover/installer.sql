-- Schema only: synthetic upgrade fixture, no application records or credentials.

CREATE TABLE delivery_settings (
	id SERIAL NOT NULL,
	min_interval_seconds INTEGER DEFAULT '2' NOT NULL,
	max_posts INTEGER DEFAULT '30' NOT NULL,
	window_seconds INTEGER DEFAULT '60' NOT NULL,
	max_read_retries INTEGER DEFAULT '3' NOT NULL,
	status_interval_seconds INTEGER DEFAULT '300' NOT NULL,
	performance_interval_seconds INTEGER DEFAULT '900' NOT NULL,
	paused BOOLEAN DEFAULT 'false' NOT NULL,
	imports_enabled BOOLEAN DEFAULT 'true' NOT NULL,
	posting_heartbeat TIMESTAMP WITH TIME ZONE,
	sync_heartbeat TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT ck_delivery_singleton CHECK (id = 1),
	CONSTRAINT ck_delivery_posting_limits CHECK (min_interval_seconds BETWEEN 1 AND 3600 AND max_posts BETWEEN 1 AND 10000 AND window_seconds BETWEEN 1 AND 86400),
	CONSTRAINT ck_delivery_read_limits CHECK (max_read_retries BETWEEN 0 AND 10 AND status_interval_seconds BETWEEN 60 AND 86400 AND performance_interval_seconds BETWEEN 60 AND 86400)
);

CREATE TABLE telemetry_events (
	id VARCHAR(36) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	trace_id VARCHAR(32) NOT NULL,
	span_id VARCHAR(16) NOT NULL,
	parent_span_id VARCHAR(16),
	request_id VARCHAR(36),
	session_id VARCHAR(36),
	user_id VARCHAR,
	kind VARCHAR(32) NOT NULL,
	level VARCHAR(10) NOT NULL,
	name VARCHAR(200) NOT NULL,
	message TEXT,
	duration_ms FLOAT,
	status_code INTEGER,
	fingerprint VARCHAR(64),
	attributes JSON NOT NULL,
	environment VARCHAR(80) NOT NULL,
	release VARCHAR(80),
	PRIMARY KEY (id)
);

CREATE INDEX ix_telemetry_created ON telemetry_events (created_at, id);

CREATE INDEX ix_telemetry_trace ON telemetry_events (trace_id, created_at);

CREATE INDEX ix_telemetry_session ON telemetry_events (session_id, created_at);

CREATE INDEX ix_telemetry_user ON telemetry_events (user_id, created_at);

CREATE INDEX ix_telemetry_kind ON telemetry_events (kind, created_at);

CREATE INDEX ix_telemetry_errors ON telemetry_events (level, fingerprint, created_at);

CREATE INDEX ix_telemetry_request ON telemetry_events (request_id);

CREATE TABLE users (
	id VARCHAR NOT NULL,
	email VARCHAR NOT NULL,
	hashed_password VARCHAR NOT NULL,
	name VARCHAR,
	is_active BOOLEAN,
	is_superuser BOOLEAN,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE roles (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	UNIQUE (name)
);

CREATE TABLE permissions (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	UNIQUE (name)
);

CREATE TABLE brands (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	logo VARCHAR,
	primary_color VARCHAR,
	secondary_color VARCHAR,
	highlight_color VARCHAR,
	voice TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE TABLE customer_profiles (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	demographics TEXT,
	pain_points TEXT,
	goals TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE TABLE campaign_preferences (
	id VARCHAR NOT NULL,
	settings JSON NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE TABLE facebook_campaigns (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	objective VARCHAR NOT NULL,
	budget_type VARCHAR NOT NULL,
	daily_budget INTEGER,
	daily_budget_minor INTEGER,
	bid_strategy VARCHAR,
	status VARCHAR,
	fb_campaign_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE TABLE winning_ads (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	image_url VARCHAR NOT NULL,
	notes TEXT,
	tags TEXT,
	analysis TEXT,
	recreation_prompt TEXT,
	topic VARCHAR,
	mood VARCHAR,
	subject_matter VARCHAR,
	copy_analysis TEXT,
	product_name VARCHAR,
	category VARCHAR,
	design_style VARCHAR,
	filename VARCHAR,
	structural_analysis TEXT,
	layering TEXT,
	template_structure JSON,
	color_palette JSON,
	typography_system JSON,
	copy_patterns JSON,
	visual_elements JSON,
	template_category VARCHAR,
	blueprint_json JSON,
	blueprint_analyzed_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE TABLE verticals (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_verticals_name ON verticals (name);

CREATE TABLE api_usage_logs (
	id VARCHAR NOT NULL,
	endpoint VARCHAR NOT NULL,
	api_calls INTEGER NOT NULL,
	ads_returned INTEGER NOT NULL,
	ads_saved INTEGER NOT NULL,
	query VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	date VARCHAR NOT NULL,
	PRIMARY KEY (id)
);

CREATE INDEX ix_api_usage_logs_date ON api_usage_logs (date);

CREATE TABLE page_blacklist (
	id VARCHAR NOT NULL,
	page_name VARCHAR NOT NULL,
	reason VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_page_blacklist_page_name ON page_blacklist (page_name);

CREATE TABLE keyword_blacklist (
	id VARCHAR NOT NULL,
	keyword VARCHAR NOT NULL,
	reason VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_keyword_blacklist_keyword ON keyword_blacklist (keyword);

CREATE TABLE prompts (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	category VARCHAR NOT NULL,
	description TEXT,
	variables JSON,
	template TEXT NOT NULL,
	notes TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id)
);

CREATE TABLE ad_styles (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	category VARCHAR NOT NULL,
	description TEXT,
	best_for JSON,
	visual_layout VARCHAR,
	psychology TEXT,
	mood VARCHAR,
	lighting VARCHAR,
	composition VARCHAR,
	design_style VARCHAR,
	prompt TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id)
);

CREATE TABLE brand_scrapes (
	id VARCHAR NOT NULL,
	brand_name VARCHAR NOT NULL,
	page_id VARCHAR NOT NULL,
	page_name VARCHAR,
	page_url VARCHAR NOT NULL,
	total_ads INTEGER,
	media_downloaded INTEGER,
	status VARCHAR,
	error_message TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id)
);

CREATE INDEX ix_brand_scrapes_brand_name ON brand_scrapes (brand_name);

CREATE TABLE workspaces (
	id VARCHAR NOT NULL,
	name VARCHAR(120) NOT NULL,
	is_active BOOLEAN DEFAULT 'true' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE installation_state (
	id SERIAL NOT NULL,
	installation_id VARCHAR NOT NULL,
	initialized BOOLEAN NOT NULL,
	setup_status VARCHAR(20) NOT NULL,
	setup_step VARCHAR(20) NOT NULL,
	worker_heartbeat_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_installation_singleton CHECK (id = 1),
	CONSTRAINT ck_installation_status CHECK (setup_status IN ('pending','in_progress','deferred','complete')),
	CONSTRAINT ck_installation_step CHECK (setup_step IN ('welcome','providers','brand','create')),
	UNIQUE (installation_id)
);

CREATE TABLE delivery_syncs (
	owner_id VARCHAR(36) NOT NULL,
	id VARCHAR(36) NOT NULL,
	account_id VARCHAR(80) NOT NULL,
	kind VARCHAR(20) NOT NULL,
	status VARCHAR(20) DEFAULT 'idle' NOT NULL,
	failures INTEGER DEFAULT '0' NOT NULL,
	next_run_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	run_started_at TIMESTAMP WITH TIME ZONE,
	last_success_at TIMESTAMP WITH TIME ZONE,
	last_reconciled_at TIMESTAMP WITH TIME ZONE,
	error_message TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_delivery_sync UNIQUE (owner_id, account_id, kind),
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE user_roles (
	user_id VARCHAR NOT NULL,
	role_id VARCHAR NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (user_id, role_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE role_permissions (
	role_id VARCHAR NOT NULL,
	permission_id VARCHAR NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (role_id, permission_id),
	FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE,
	FOREIGN KEY(permission_id) REFERENCES permissions (id) ON DELETE CASCADE
);

CREATE TABLE brand_profiles (
	brand_id VARCHAR NOT NULL,
	profile_id VARCHAR NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (brand_id, profile_id),
	FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE CASCADE,
	FOREIGN KEY(profile_id) REFERENCES customer_profiles (id) ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	token_hash VARCHAR,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ix_refresh_tokens_token_hash ON refresh_tokens (token_hash);

CREATE TABLE products (
	id VARCHAR NOT NULL,
	brand_id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	description TEXT,
	product_shots JSON,
	default_url TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE CASCADE
);

CREATE TABLE campaign_presets (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	ad_account_id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	vertical VARCHAR NOT NULL,
	settings JSON NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_campaign_presets_ad_account_id ON campaign_presets (ad_account_id);

CREATE INDEX ix_campaign_presets_user_id ON campaign_presets (user_id);

CREATE TABLE leadrouter_connections (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	account_type VARCHAR NOT NULL,
	account_name VARCHAR NOT NULL,
	partner_id VARCHAR,
	encrypted_api_key TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_leadrouter_account_type CHECK (account_type IN ('partner', 'organization')),
	UNIQUE (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE facebook_adsets (
	id VARCHAR NOT NULL,
	campaign_id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	optimization_goal VARCHAR NOT NULL,
	daily_budget INTEGER,
	daily_budget_minor INTEGER,
	bid_strategy VARCHAR,
	bid_amount INTEGER,
	bid_amount_minor INTEGER,
	targeting JSON,
	pixel_id VARCHAR,
	conversion_event VARCHAR,
	status VARCHAR,
	fb_adset_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(campaign_id) REFERENCES facebook_campaigns (id) ON DELETE CASCADE
);

CREATE TABLE facebook_pages (
	id VARCHAR NOT NULL,
	page_name VARCHAR NOT NULL,
	page_url VARCHAR,
	vertical_id VARCHAR,
	total_ads INTEGER,
	first_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
	last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(vertical_id) REFERENCES verticals (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX ix_facebook_pages_page_name ON facebook_pages (page_name);

CREATE TABLE saved_searches (
	id VARCHAR NOT NULL,
	query VARCHAR NOT NULL,
	country VARCHAR,
	negative_keywords JSON,
	vertical_id VARCHAR,
	search_type VARCHAR,
	schedule_config JSON,
	is_active BOOLEAN,
	last_run TIMESTAMP WITH TIME ZONE,
	ads_requested INTEGER,
	ads_returned INTEGER,
	ads_new INTEGER,
	ads_duplicate INTEGER,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(vertical_id) REFERENCES verticals (id) ON DELETE SET NULL
);

CREATE TABLE search_logs (
	id VARCHAR NOT NULL,
	search_query VARCHAR NOT NULL,
	country VARCHAR,
	negative_keywords JSON,
	vertical_id VARCHAR,
	total_ads_found INTEGER,
	filtered_by_page_blacklist INTEGER,
	filtered_by_keyword_blacklist INTEGER,
	final_ads_saved INTEGER,
	new_pages_blacklisted JSON,
	api_calls_made INTEGER,
	search_type VARCHAR,
	execution_time_seconds INTEGER,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	date VARCHAR NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(vertical_id) REFERENCES verticals (id) ON DELETE SET NULL
);

CREATE INDEX ix_search_logs_date ON search_logs (date);

CREATE TABLE brand_scraped_ads (
	id VARCHAR NOT NULL,
	brand_scrape_id VARCHAR NOT NULL,
	external_id VARCHAR NOT NULL,
	page_name VARCHAR,
	page_link VARCHAR,
	headline VARCHAR,
	ad_copy TEXT,
	cta_text VARCHAR,
	media_type VARCHAR,
	media_urls JSON,
	original_media_urls JSON,
	platforms JSON,
	start_date VARCHAR,
	ad_link VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(brand_scrape_id) REFERENCES brand_scrapes (id) ON DELETE CASCADE
);

CREATE INDEX ix_brand_scraped_ads_external_id ON brand_scraped_ads (external_id);

CREATE TABLE plugin_installations (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	slug VARCHAR NOT NULL,
	version VARCHAR NOT NULL,
	document JSON NOT NULL,
	package_digest VARCHAR NOT NULL,
	enabled BOOLEAN DEFAULT 'true' NOT NULL,
	configuration JSON NOT NULL,
	worker_key_hash VARCHAR,
	worker_key_prefix VARCHAR,
	worker_key_expires_at TIMESTAMP WITH TIME ZONE,
	worker_last_seen_at TIMESTAMP WITH TIME ZONE,
	worker_generation INTEGER DEFAULT '0' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	archived_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_plugin_release UNIQUE (user_id, slug, version),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	UNIQUE (worker_key_hash)
);

CREATE INDEX ix_plugin_installations_user_id ON plugin_installations (user_id);

CREATE TABLE api_keys (
	id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	key_hash VARCHAR NOT NULL,
	scopes JSON NOT NULL,
	created_by_user_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	last_used_at TIMESTAMP WITH TIME ZONE,
	revoked_at TIMESTAMP WITH TIME ZONE,
	key_prefix VARCHAR(20),
	expires_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX ix_api_keys_key_hash ON api_keys (key_hash);

CREATE TABLE google_ads_connections (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	customer_id VARCHAR NOT NULL,
	account_name VARCHAR,
	encrypted_refresh_token TEXT NOT NULL,
	encrypted_access_token TEXT,
	access_token_expires_at TIMESTAMP WITH TIME ZONE,
	is_active BOOLEAN,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE meta_ads_connections (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	ad_account_id VARCHAR NOT NULL,
	account_name VARCHAR,
	encrypted_access_token TEXT NOT NULL,
	access_token_expires_at TIMESTAMP WITH TIME ZONE,
	is_active BOOLEAN,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tiktok_ads_connections (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	advertiser_id VARCHAR NOT NULL,
	account_name VARCHAR,
	encrypted_refresh_token TEXT NOT NULL,
	encrypted_access_token TEXT,
	access_token_expires_at TIMESTAMP WITH TIME ZONE,
	is_active BOOLEAN,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE workspace_memberships (
	workspace_id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	role VARCHAR(32) NOT NULL,
	is_active BOOLEAN DEFAULT 'true' NOT NULL,
	version INTEGER DEFAULT '1' NOT NULL,
	PRIMARY KEY (workspace_id, user_id),
	CONSTRAINT ck_workspace_member_role CHECK (role IN ('viewer','creative_editor','buyer','publisher','admin')),
	CONSTRAINT ck_workspace_member_version CHECK (version > 0),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE workspace_audit_events (
	id VARCHAR NOT NULL,
	workspace_id VARCHAR NOT NULL,
	actor_user_id VARCHAR,
	action VARCHAR(64) NOT NULL,
	resource_id VARCHAR NOT NULL,
	details JSON NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_workspace_audit_events_workspace_id ON workspace_audit_events (workspace_id);

CREATE TABLE user_themes (
	id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	document JSON NOT NULL,
	github_url VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_user_themes_user_id ON user_themes (user_id);

CREATE TABLE provider_connections (
	provider VARCHAR(20) NOT NULL,
	encrypted_key TEXT,
	key_hint VARCHAR(4),
	disabled BOOLEAN NOT NULL,
	version INTEGER NOT NULL,
	status VARCHAR(32) NOT NULL,
	status_message VARCHAR(300),
	last_checked_at TIMESTAMP WITH TIME ZONE,
	updated_by_user_id VARCHAR,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (provider),
	CONSTRAINT ck_provider_name CHECK (provider IN ('gemini','fal','kie')),
	CONSTRAINT ck_provider_status CHECK (status IN ('not_configured','saved_unverified','connected','invalid','insufficient_credit','temporarily_unavailable')),
	FOREIGN KEY(updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE leadrouter_defaults (
	id VARCHAR NOT NULL,
	connection_id VARCHAR NOT NULL,
	resource_type VARCHAR NOT NULL,
	resource_id VARCHAR NOT NULL,
	campaign_id VARCHAR NOT NULL,
	campaign JSON NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_leadrouter_default UNIQUE (connection_id, resource_type, resource_id),
	CONSTRAINT ck_leadrouter_resource_type CHECK (resource_type IN ('brand', 'product', 'campaign')),
	FOREIGN KEY(connection_id) REFERENCES leadrouter_connections (id) ON DELETE CASCADE
);

CREATE TABLE facebook_ads (
	id VARCHAR NOT NULL,
	adset_id VARCHAR NOT NULL,
	name VARCHAR NOT NULL,
	creative_name VARCHAR,
	image_url VARCHAR,
	media_type VARCHAR,
	video_url VARCHAR,
	video_id VARCHAR,
	thumbnail_url VARCHAR,
	bodies JSON,
	headlines JSON,
	description TEXT,
	cta VARCHAR,
	website_url VARCHAR,
	status VARCHAR,
	fb_ad_id VARCHAR,
	fb_creative_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(adset_id) REFERENCES facebook_adsets (id) ON DELETE CASCADE
);

CREATE TABLE generated_ads (
	id VARCHAR NOT NULL,
	brand_id VARCHAR,
	product_id VARCHAR,
	template_id VARCHAR,
	image_url VARCHAR,
	headline VARCHAR,
	body TEXT,
	cta VARCHAR,
	size_name VARCHAR,
	dimensions VARCHAR,
	prompt TEXT,
	ad_bundle_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	media_type VARCHAR,
	video_url VARCHAR,
	video_id VARCHAR,
	thumbnail_url VARCHAR,
	PRIMARY KEY (id),
	FOREIGN KEY(brand_id) REFERENCES brands (id) ON DELETE SET NULL,
	FOREIGN KEY(product_id) REFERENCES products (id) ON DELETE SET NULL,
	FOREIGN KEY(template_id) REFERENCES winning_ads (id) ON DELETE SET NULL
);

CREATE TABLE scraped_ads (
	id VARCHAR NOT NULL,
	brand_name VARCHAR,
	headline VARCHAR,
	ad_copy TEXT,
	cta_text VARCHAR,
	platform VARCHAR,
	external_id VARCHAR,
	content_hash VARCHAR,
	ad_link VARCHAR NOT NULL,
	platforms JSON,
	start_date VARCHAR,
	media_type VARCHAR,
	first_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
	last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
	seen_count INTEGER,
	search_id VARCHAR,
	facebook_page_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
	PRIMARY KEY (id),
	FOREIGN KEY(search_id) REFERENCES saved_searches (id) ON DELETE CASCADE,
	FOREIGN KEY(facebook_page_id) REFERENCES facebook_pages (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX ix_scraped_ads_content_hash ON scraped_ads (content_hash);

CREATE UNIQUE INDEX ix_scraped_ads_external_id ON scraped_ads (external_id);

CREATE TABLE plugin_runs (
	id VARCHAR NOT NULL,
	installation_id VARCHAR NOT NULL,
	request_id VARCHAR NOT NULL,
	input_digest VARCHAR NOT NULL,
	package_digest VARCHAR NOT NULL,
	inputs JSON NOT NULL,
	configuration JSON NOT NULL,
	status VARCHAR NOT NULL,
	output JSON,
	error VARCHAR,
	lease_hash VARCHAR,
	lease_expires_at TIMESTAMP WITH TIME ZONE,
	worker_generation INTEGER,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	completed_at TIMESTAMP WITH TIME ZONE,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_plugin_run_request UNIQUE (installation_id, request_id),
	CONSTRAINT ck_plugin_run_status CHECK (status IN ('queued','running','succeeded','failed','cancelled','expired')),
	FOREIGN KEY(installation_id) REFERENCES plugin_installations (id) ON DELETE CASCADE
);

CREATE INDEX ix_plugin_runs_installation_id ON plugin_runs (installation_id);

CREATE TABLE workspace_accounts (
	id VARCHAR NOT NULL,
	workspace_id VARCHAR NOT NULL,
	provider VARCHAR(20) DEFAULT 'meta' NOT NULL,
	external_account_id VARCHAR(100) NOT NULL,
	meta_connection_id VARCHAR,
	is_active BOOLEAN DEFAULT 'true' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_workspace_account_scope UNIQUE (workspace_id, id),
	CONSTRAINT uq_workspace_provider_account UNIQUE (workspace_id, provider, external_account_id),
	CONSTRAINT ck_workspace_account_provider CHECK (provider = 'meta'),
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
	FOREIGN KEY(meta_connection_id) REFERENCES meta_ads_connections (id) ON DELETE SET NULL
);

CREATE TABLE delivery_jobs (
	id VARCHAR(36) NOT NULL,
	owner_id VARCHAR,
	request_key VARCHAR(160) NOT NULL,
	request_hash VARCHAR(64) NOT NULL,
	account_id VARCHAR(80) NOT NULL,
	name VARCHAR(200) NOT NULL,
	kind VARCHAR(20) NOT NULL,
	status VARCHAR(32) DEFAULT 'queued' NOT NULL,
	stage VARCHAR(32) DEFAULT 'ad' NOT NULL,
	payload JSON NOT NULL,
	results JSON DEFAULT '{}' NOT NULL,
	generated_ad_id VARCHAR,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	available_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	stage_started_at TIMESTAMP WITH TIME ZONE,
	post_started_at TIMESTAMP WITH TIME ZONE,
	finished_at TIMESTAMP WITH TIME ZONE,
	read_failures INTEGER DEFAULT '0' NOT NULL,
	error_message TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_delivery_submission UNIQUE (owner_id, request_key),
	CONSTRAINT ck_delivery_job_status CHECK (status IN ('queued','working','succeeded','failed','needs_reconciliation','cancelled')),
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE SET NULL,
	FOREIGN KEY(generated_ad_id) REFERENCES generated_ads (id) ON DELETE SET NULL
);

CREATE INDEX ix_delivery_jobs_post_started_at ON delivery_jobs (post_started_at);

CREATE INDEX ix_delivery_ready ON delivery_jobs (status, available_at, created_at);

CREATE TABLE workspace_account_grants (
	workspace_id VARCHAR NOT NULL,
	account_id VARCHAR NOT NULL,
	user_id VARCHAR NOT NULL,
	can_sync BOOLEAN DEFAULT 'false' NOT NULL,
	is_active BOOLEAN DEFAULT 'true' NOT NULL,
	version INTEGER DEFAULT '1' NOT NULL,
	PRIMARY KEY (workspace_id, account_id, user_id),
	FOREIGN KEY(workspace_id, account_id) REFERENCES workspace_accounts (workspace_id, id) ON DELETE CASCADE,
	FOREIGN KEY(workspace_id, user_id) REFERENCES workspace_memberships (workspace_id, user_id) ON DELETE CASCADE,
	CONSTRAINT ck_workspace_grant_version CHECK (version > 0)
);

CREATE TABLE account_sync_jobs (
	id VARCHAR NOT NULL,
	workspace_id VARCHAR NOT NULL,
	account_id VARCHAR NOT NULL,
	resource VARCHAR(32) DEFAULT 'campaigns' NOT NULL,
	requested_by_user_id VARCHAR,
	membership_version INTEGER NOT NULL,
	grant_version INTEGER NOT NULL,
	connection_id VARCHAR,
	credential_owner_version INTEGER NOT NULL,
	status VARCHAR(20) DEFAULT 'queued' NOT NULL,
	attempts INTEGER DEFAULT '0' NOT NULL,
	pages_fetched INTEGER DEFAULT '0' NOT NULL,
	worker_id VARCHAR(120),
	lease_token VARCHAR,
	lease_expires_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	started_at TIMESTAMP WITH TIME ZONE,
	completed_at TIMESTAMP WITH TIME ZONE,
	error_code VARCHAR(40),
	PRIMARY KEY (id),
	FOREIGN KEY(workspace_id, account_id) REFERENCES workspace_accounts (workspace_id, id) ON DELETE CASCADE,
	CONSTRAINT uq_account_job_scope UNIQUE (workspace_id, account_id, id),
	CONSTRAINT ck_account_job_resource CHECK (resource = 'campaigns'),
	CONSTRAINT ck_account_job_status CHECK (status IN ('queued','running','succeeded','failed','blocked')),
	CONSTRAINT ck_account_job_counts CHECK (attempts >= 0 AND pages_fetched >= 0),
	CONSTRAINT ck_account_job_lease CHECK ((status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)),
	FOREIGN KEY(requested_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
	FOREIGN KEY(connection_id) REFERENCES meta_ads_connections (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_active_account_sync ON account_sync_jobs (workspace_id, account_id, resource) WHERE status IN ('queued','running');

CREATE INDEX ix_account_sync_claim ON account_sync_jobs (status, created_at);

CREATE TABLE managed_ads (
	id VARCHAR(36) NOT NULL,
	job_id VARCHAR(36) NOT NULL,
	owner_id VARCHAR,
	account_id VARCHAR(80) NOT NULL,
	fb_ad_id VARCHAR(80) NOT NULL,
	fb_adset_id VARCHAR(80) NOT NULL,
	fb_creative_id VARCHAR(80) NOT NULL,
	local_ad_id VARCHAR,
	generated_ad_id VARCHAR,
	name VARCHAR(200) NOT NULL,
	effective_status VARCHAR(80),
	status_synced_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_managed_facebook_ad UNIQUE (account_id, fb_ad_id),
	UNIQUE (job_id),
	FOREIGN KEY(job_id) REFERENCES delivery_jobs (id),
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE SET NULL,
	FOREIGN KEY(local_ad_id) REFERENCES facebook_ads (id) ON DELETE SET NULL,
	FOREIGN KEY(generated_ad_id) REFERENCES generated_ads (id) ON DELETE SET NULL
);

CREATE TABLE account_snapshots (
	workspace_id VARCHAR NOT NULL,
	account_id VARCHAR NOT NULL,
	resource VARCHAR(32) NOT NULL,
	generation_id VARCHAR NOT NULL,
	items JSON NOT NULL,
	last_success_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (workspace_id, account_id, resource),
	FOREIGN KEY(workspace_id, account_id) REFERENCES workspace_accounts (workspace_id, id) ON DELETE CASCADE,
	FOREIGN KEY(workspace_id, account_id, generation_id) REFERENCES account_sync_jobs (workspace_id, account_id, id) ON DELETE CASCADE,
	CONSTRAINT ck_account_snapshot_resource CHECK (resource = 'campaigns')
);

CREATE TABLE ad_insights (
	id VARCHAR(36) NOT NULL,
	managed_ad_id VARCHAR(36) NOT NULL,
	report_date DATE NOT NULL,
	dataset VARCHAR(160) NOT NULL,
	currency VARCHAR(3) NOT NULL,
	account_timezone VARCHAR(80) NOT NULL,
	impressions NUMERIC(24, 0) NOT NULL,
	clicks NUMERIC(24, 0) NOT NULL,
	spend NUMERIC(24, 6) NOT NULL,
	actions JSON NOT NULL,
	imported_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ad_insight_snapshot UNIQUE (managed_ad_id, report_date, dataset),
	FOREIGN KEY(managed_ad_id) REFERENCES managed_ads (id) ON DELETE CASCADE
);
