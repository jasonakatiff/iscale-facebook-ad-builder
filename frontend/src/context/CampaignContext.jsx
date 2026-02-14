import React, { createContext, useContext, useState } from 'react';

const CampaignContext = createContext();

export const useCampaign = () => {
    const context = useContext(CampaignContext);
    if (!context) {
        throw new Error('useCampaign must be used within CampaignProvider');
    }
    return context;
};

export const CampaignProvider = ({ children }) => {
    const [campaignData, setCampaignData] = useState({
        id: null,
        name: '',
        objective: 'OUTCOME_SALES',
        budgetType: 'ABO',
        dailyBudget: 0,
        bidStrategy: '',
        status: 'PAUSED',
        fbCampaignId: null,
        isExisting: false
    });

    const [adsetData, setAdsetData] = useState({
        id: null,
        name: '',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        dailyBudget: 0,
        bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
        bidAmount: 0,
        targeting: {
            genders: [], // [] = All, [1] = Male, [2] = Female
            publisher_platforms: ['facebook', 'instagram'], // Default to Manual (FB & IG)
            geo_locations: {
                countries: ['US'],
                excluded_countries: [],
                regions: [],
                excluded_regions: [],
                cities: [],
                excluded_cities: [],
                geo_markets: [],
                excluded_geo_markets: []
            },
            ageMin: 18,
            ageMax: 65
        },
        advantageAudience: 0, // 0 = Off, 1 = On
        startTime: (() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(1, 0, 0, 0);
            // Format to YYYY-MM-DDThh:mm for datetime-local input
            const year = tomorrow.getFullYear();
            const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const day = String(tomorrow.getDate()).padStart(2, '0');
            const hours = String(tomorrow.getHours()).padStart(2, '0');
            const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        })(),
        pixelId: '',
        conversionEvent: 'PURCHASE',
        attributionSetting: '7d_click', // Default to 7-day click attribution
        status: 'PAUSED',
        fbAdsetId: null,
        isExisting: false
    });

    const [creativeData, setCreativeData] = useState({
        creativeMode: 'per_creative', // 'standard' or 'per_creative'
        creativeName: '',
        creatives: [], // Array of { id, file, previewUrl, name, mediaType, headlines?, bodies?, description?, cta? }
        bodies: [''], // Start with 1 field (used in standard mode)
        headlines: [''], // Start with 1 field (used in standard mode)
        description: '',
        cta: 'LEARN_MORE',
        websiteUrl: '',
        pageId: '',
        instagramId: null // Explicitly set to null when no IG account is connected
    });

    const [adsData, setAdsData] = useState([]);

    const [selectedAdAccount, setSelectedAdAccount] = useState(null);

    const resetWizard = () => {
        setCampaignData({
            id: null,
            name: '',
            objective: 'OUTCOME_SALES',
            budgetType: 'ABO',
            dailyBudget: 0,
            bidStrategy: '',
            status: 'PAUSED',
            fbCampaignId: null,
            isExisting: false
        });
        setAdsetData({
            id: null,
            name: '',
            optimizationGoal: 'OFFSITE_CONVERSIONS',
            dailyBudget: 0,
            bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
            bidAmount: 0,
            targeting: {
                genders: [],
                publisher_platforms: ['facebook', 'instagram'],
                countries: ['US'],
                ageMin: 18,
                ageMax: 65
            },
            advantageAudience: 0,
            startTime: (() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(1, 0, 0, 0);
                const year = tomorrow.getFullYear();
                const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
                const day = String(tomorrow.getDate()).padStart(2, '0');
                const hours = String(tomorrow.getHours()).padStart(2, '0');
                const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            })(),
            pixelId: '',
            conversionEvent: 'PURCHASE',
            status: 'PAUSED',
            fbAdsetId: null,
            isExisting: false
        });
        setCreativeData({
            creativeName: '',
            creatives: [],
            bodies: ['', '', ''],
            headlines: ['', '', ''],
            description: '',
            cta: 'LEARN_MORE',
            websiteUrl: '',
            pageId: ''
        });
        setAdsData([]);
        setSelectedAdAccount(null);
    };

    const value = {
        campaignData,
        setCampaignData,
        adsetData,
        setAdsetData,
        creativeData,
        setCreativeData,
        adsData,
        setAdsData,
        selectedAdAccount,
        setSelectedAdAccount,
        resetWizard
    };

    return (
        <CampaignContext.Provider value={value}>
            {children}
        </CampaignContext.Provider>
    );
};
