import { moneyToMinor, minorToMoney } from './money';
import { accountTimeToUtc } from './accountTime';

export const OBJECTIVES = {
    OUTCOME_SALES: {
        label: 'Sales',
        goals: ['OFFSITE_CONVERSIONS', 'LINK_CLICKS'],
        events: ['PURCHASE', 'ADD_TO_CART', 'INITIATE_CHECKOUT', 'ADD_PAYMENT_INFO', 'SUBSCRIBE'],
    },
    OUTCOME_LEADS: {
        label: 'Leads',
        goals: ['OFFSITE_CONVERSIONS'],
        events: ['LEAD', 'COMPLETE_REGISTRATION', 'CONTACT'],
    },
    OUTCOME_TRAFFIC: {
        label: 'Traffic',
        goals: ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'IMPRESSIONS', 'REACH'],
        events: [],
    },
    OUTCOME_ENGAGEMENT: {
        label: 'Engagement',
        goals: ['POST_ENGAGEMENT', 'THRUPLAY', 'VIDEO_VIEWS'],
        events: [],
    },
    OUTCOME_AWARENESS: {
        label: 'Awareness',
        goals: ['REACH', 'IMPRESSIONS', 'THRUPLAY'],
        events: [],
    },
};

export const SPECIAL_CATEGORIES = [
    'HOUSING',
    'EMPLOYMENT',
    'FINANCIAL_PRODUCTS_SERVICES',
    'ISSUES_ELECTIONS_POLITICS',
];
export const PLACEMENTS = {
    facebook: {
        label: 'Facebook',
        positions: {
            feed: 'Feed',
            story: 'Stories',
            facebook_reels: 'Reels',
            marketplace: 'Marketplace',
            video_feeds: 'Video feeds',
            right_hand_column: 'Right column',
            search: 'Search results',
            instream_video: 'In-stream video',
        },
    },
    instagram: {
        label: 'Instagram',
        positions: {
            stream: 'Feed',
            story: 'Stories',
            reels: 'Reels',
            explore: 'Explore',
            explore_home: 'Explore home',
            profile_feed: 'Profile feed',
            ig_search: 'Search results',
        },
    },
    audience_network: {
        label: 'Audience Network',
        positions: { classic: 'Native, banner and interstitial', rewarded_video: 'Rewarded video' },
    },
    messenger: { label: 'Messenger', positions: { messenger_home: 'Inbox', story: 'Stories' } },
};
export const TRACKING_MACROS = {
    ad_id: '{{ad.id}}',
    adset_id: '{{adset.id}}',
    campaign_id: '{{campaign.id}}',
    ad_name: '{{ad.name}}',
    adset_name: '{{adset.name}}',
    campaign_name: '{{campaign.name}}',
    source: '{{site_source_name}}',
    placement: '{{placement}}',
};
export const defaultTrackingParameters = Object.entries(TRACKING_MACROS)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

export const MEDIA_LIMITS = { image: 10 * 1024 * 1024, video: 500 * 1024 * 1024 };
export const MEDIA_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
};

export function defaultWizardState() {
    return {
        currentStep: 1,
        leadRouter: null,
        selectedAdAccount: null,
        campaignData: {
            id: null,
            name: '',
            objective: 'OUTCOME_SALES',
            budgetType: 'ABO',
            dailyBudget: '',
            bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
            bidAmount: '',
            status: 'PAUSED',
            specialAdCategories: [],
            specialAdCategoryCountries: [],
            fbCampaignId: null,
            isExisting: false,
        },
        adsetData: {
            id: null,
            name: '',
            optimizationGoal: 'OFFSITE_CONVERSIONS',
            dailyBudget: '',
            bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
            bidAmount: '',
            targeting: {
                genders: [],
                publisher_platforms: ['facebook', 'instagram'],
                geo_locations: { countries: ['US'] },
                ageMin: 18,
                ageMax: 65,
            },
            advantageAudience: 0,
            startTime: '',
            pixelId: '',
            conversionEvent: 'PURCHASE',
            attributionSetting: '7d_click',
            status: 'PAUSED',
            fbAdsetId: null,
            isExisting: false,
        },
        creativeData: {
            creativeName: '',
            creatives: [],
            bodies: [''],
            headlines: [''],
            description: '',
            cta: 'LEARN_MORE',
            websiteUrl: '',
            pageId: '',
            instagramId: null,
            urlParameters: defaultTrackingParameters,
        },
        adsData: [],
        publishProgress: null,
    };
}

export function normalizeObjective(objective, adset) {
    const config = OBJECTIVES[objective];
    if (!config) return adset;
    const optimizationGoal = config.goals.includes(adset.optimizationGoal)
        ? adset.optimizationGoal
        : config.goals[0];
    const conversionEvent =
        optimizationGoal === 'OFFSITE_CONVERSIONS'
            ? config.events.includes(adset.conversionEvent)
                ? adset.conversionEvent
                : config.events[0]
            : '';
    return { ...adset, optimizationGoal, conversionEvent };
}

export const stripFileExtension = (name) => String(name || '').replace(/\.[^.]+$/, '');
export function buildAdVariants(creativeData, previous = []) {
    const ads = [];
    const headlines = (creativeData.headlines || [])
        .map((text, index) => ({ text, index }))
        .filter((v) => v.text.trim());
    const bodies = (creativeData.bodies || [])
        .map((text, index) => ({ text, index }))
        .filter((v) => v.text.trim());
    for (const creative of creativeData.creatives || [])
        for (const headline of headlines)
            for (const body of bodies) {
                const key = `${creative.id}:${headline.index}:${body.index}`;
                const existing = previous.find((ad) => ad.variantKey === key);
                const baseName =
                    stripFileExtension(creative.name).trim().replace(/\s+/g, '_') || 'creative';
                ads.push({
                    id: existing?.id || crypto.randomUUID(),
                    variantKey: key,
                    name:
                        existing?.name ??
                        `${baseName}${headlines.length * bodies.length > 1 ? `_H${headline.index + 1}B${body.index + 1}` : ''}`,
                    creativeId: creative.id,
                    headlineIndex: headline.index,
                    bodyIndex: body.index,
                    mediaType: creative.mediaType || 'image',
                    status: 'PAUSED',
                    ...(existing || {}),
                });
            }
    return ads;
}

export function validateWizard(state, step = null) {
    const {
        campaignData: campaign,
        adsetData: adset,
        creativeData: creative,
        selectedAdAccount: account,
    } = state;
    const errors = [];
    const add = (field, message) => errors.push({ field, message });
    const check = (n) => step === null || step === n;
    const budget = (data, prefix) => {
        if (account && account.minDailyBudget == null)
            add(`${prefix}.dailyBudget`, 'Sync the ad account to load its minimum daily budget.');
        try {
            const minor = moneyToMinor(data.dailyBudget);
            const min = Math.max(1, Number(account?.minDailyBudget || 1));
            if (minor < min)
                add(
                    `${prefix}.dailyBudget`,
                    `Daily budget must be at least ${minorToMoney(min)} ${account?.currency || ''}.`,
                );
        } catch (error) {
            add(`${prefix}.dailyBudget`, error.message);
        }
        if (['COST_CAP', 'LOWEST_COST_WITH_BID_CAP'].includes(data.bidStrategy)) {
            try {
                if (moneyToMinor(data.bidAmount) < 1) throw new Error();
            } catch {
                add(`${prefix}.bidAmount`, 'Enter a positive bid amount.');
            }
        }
    };
    if (check(1) && !account) add('selectedAdAccount', 'Select an ad account.');
    if (check(2)) {
        if (!campaign.name?.trim()) add('campaignData.name', 'Campaign Name is required.');
        if (!OBJECTIVES[campaign.objective])
            add('campaignData.objective', 'Select a supported website campaign objective.');
        if (!campaign.isExisting && campaign.budgetType === 'CBO') budget(campaign, 'campaignData');
        if (campaign.specialAdCategories?.length && !campaign.specialAdCategoryCountries?.length)
            add(
                'campaignData.specialAdCategoryCountries',
                'Select the countries for the special ad category.',
            );
    }
    if (check(3) && !adset.isExisting) {
        if (!adset.name?.trim()) add('adsetData.name', 'Ad Set Name is required.');
        const config = OBJECTIVES[campaign.objective];
        if (!config?.goals.includes(adset.optimizationGoal))
            add(
                'adsetData.optimizationGoal',
                'Optimization goal is incompatible with the campaign objective.',
            );
        if (adset.optimizationGoal === 'OFFSITE_CONVERSIONS') {
            if (!adset.pixelId) add('adsetData.pixelId', 'Select a Facebook Pixel.');
            if (!config?.events.includes(adset.conversionEvent))
                add(
                    'adsetData.conversionEvent',
                    'Conversion event is incompatible with the campaign objective.',
                );
        }
        if (campaign.budgetType === 'ABO') budget(adset, 'adsetData');
        if (
            !['countries', 'regions', 'cities', 'geo_markets'].some(
                (key) => adset.targeting.geo_locations?.[key]?.length,
            )
        )
            add('adsetData.targeting', 'Include at least one country, region, or city.');
        if (
            adset.targeting.ageMin < 18 ||
            adset.targeting.ageMax > 65 ||
            adset.targeting.ageMin > adset.targeting.ageMax
        )
            add(
                'adsetData.targeting',
                'Target ages must be between 18 and 65; minimum cannot exceed maximum.',
            );
        const platforms = adset.targeting.publisher_platforms;
        if (platforms && !platforms.length)
            add('adsetData.targeting', 'Select at least one placement.');
        for (const platform of platforms || [])
            if (adset.targeting[`${platform}_positions`]?.length === 0)
                add(
                    'adsetData.targeting',
                    `Select at least one ${PLACEMENTS[platform]?.label || platform} placement.`,
                );
        try {
            if (!adset.startTime) throw new Error('Start Date and Time is required.');
            const utc = accountTimeToUtc(adset.startTime, account?.timezone);
            if (Date.parse(utc) <= Date.now()) throw new Error('Start time must be in the future.');
        } catch (error) {
            add('adsetData.startTime', error.message);
        }
    }
    if (check(4)) {
        for (const media of creative.creatives || []) {
            if (
                media.needsUpload ||
                (!media.file && !media.previewUrl && !media.imageUrl && !media.videoUrl)
            )
                add(
                    'creativeData.creatives',
                    `Re-upload ${media.name || 'missing media'} before continuing.`,
                );
            if (
                media.file &&
                (!MEDIA_EXTENSIONS[media.file.type] ||
                    media.file.size > MEDIA_LIMITS[media.mediaType || 'image'])
            )
                add(
                    'creativeData.creatives',
                    `${media.name}: use a supported image up to 10 MB or video up to 500 MB.`,
                );
        }
        if (!creative.creativeName?.trim())
            add('creativeData.creativeName', 'Creative Name is required.');
        if (!creative.creatives?.length)
            add('creativeData.creatives', 'Upload at least one image or video.');
        if (!creative.bodies?.some((v) => v.trim()))
            add('creativeData.bodies', 'Primary text is required.');
        if (!creative.headlines?.some((v) => v.trim()))
            add('creativeData.headlines', 'A headline is required.');
        if (!creative.pageId) add('creativeData.pageId', 'Select a Facebook Page.');
        try {
            if (!['http:', 'https:'].includes(new URL(creative.websiteUrl).protocol))
                throw new Error();
        } catch {
            add(
                'creativeData.websiteUrl',
                'Website URL is required and must start with https:// or http://.',
            );
        }
        if (creative.urlParameters?.startsWith('?') || /[\s#]/.test(creative.urlParameters || ''))
            add(
                'creativeData.urlParameters',
                'Enter URL parameters without a leading ?, spaces, or #.',
            );
    }
    if (check(5) && (state.adsData.length === 0 || state.adsData.some((ad) => !ad.name?.trim())))
        add('adsData', 'Add at least one ad and name every ad.');
    return errors;
}

export function presetFromState(state) {
    const {
        id: _campaignId,
        fbCampaignId: _fbCampaignId,
        isExisting: _existingCampaign,
        name: _campaignName,
        ...campaignData
    } = state.campaignData;
    const {
        id: _adsetId,
        fbAdsetId: _fbAdsetId,
        isExisting: _existingAdset,
        name: _adsetName,
        startTime: _startTime,
        ...adsetData
    } = state.adsetData;
    const { creatives: _media, creativeName: _creativeName, ...creativeData } = state.creativeData;
    return { campaignData, adsetData, creativeData };
}

export function applyPreset(state, preset) {
    if (preset.ad_account_id !== state.selectedAdAccount?.id)
        throw new Error('Choose a preset saved for this ad account.');
    return {
        ...state,
        campaignData: {
            ...state.campaignData,
            ...preset.settings.campaignData,
            id: null,
            fbCampaignId: null,
            isExisting: false,
            status: 'PAUSED',
        },
        adsetData: {
            ...state.adsetData,
            ...preset.settings.adsetData,
            id: null,
            fbAdsetId: null,
            isExisting: false,
            status: 'PAUSED',
        },
        creativeData: { ...state.creativeData, ...preset.settings.creativeData },
        adsData: [],
        publishProgress: null,
    };
}
