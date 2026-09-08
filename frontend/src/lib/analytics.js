export const PLATFORM_NAMES = { meta: 'Facebook', google: 'Google', tiktok: 'TikTok' };
export const SOURCE_FIELDS = [
    ['performance_interval_seconds', 'Performance refresh (hours)', 900, 86400, 3600],
    ['lookback_days', 'Recent days refreshed', 1, 90],
    ['reconcile_days', 'Correction window (days)', 1, 90],
    ['reconcile_interval_hours', 'Correction frequency (hours)', 1, 168],
    ['metadata_cache_hours', 'Account discovery cache (hours)', 1, 168],
    ['api_requests_per_minute', 'Shared requests per minute', 1, 10000],
    ['api_daily_request_limit', 'Shared daily request limit', 1, 1000000],
    ['api_max_concurrency', 'Concurrent requests', 1, 10],
    ['max_read_retries', 'Read retries', 0, 10],
];
export const PATTERN_FIELDS = [
    ['days', 'Analysis window (days)', 7, 90], ['maturity_days', 'Full days to wait for attribution', 0, 30],
    ['min_impressions', 'Minimum impressions per creative', 100, 1000000],
    ['min_cohort_creatives', 'Minimum creatives per comparison', 4, 100],
    ['min_cohort_conversions', 'Minimum conversions per CPA comparison', 1, 10000],
    ['min_trait_creatives', 'Minimum creatives sharing a trait', 3, 100],
    ['winner_percent', 'Winning share (%)', 10, 50], ['max_fdr', 'Maximum false discovery rate (%)', 0.01, 0.2, 0.01],
];
export const metricNames = { cpa: 'Cost per conversion (CPA)', roas: 'Return on ad spend (ROAS)', ctr: 'Click-through rate (CTR)' };
export const fieldName = field => ({ created_by_id: 'Creative strategist', template_id: 'Template', template: 'Built-in template', input_image: 'Source image', brand_palette: 'Brand palette', image_or_video: 'Image / video', source_type: 'Creative origin' }[field] || field.replaceAll('_', ' '));
export const when = value => value ? new Date(value).toLocaleString() : 'Not yet';
