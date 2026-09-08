import { describe, expect, it } from 'vitest';
import {
    buildAdVariants,
    normalizeObjective,
    validateWizard,
    defaultWizardState,
    stripFileExtension,
    presetFromState,
    applyPreset,
    defaultTrackingParameters,
} from '../lib/campaignWizard.js';
import { moneyToMinor, minorToMoney } from '../lib/money.js';
import { accountTimeToUtc, tomorrowInTimezone } from '../lib/accountTime.js';

describe('Breadwinner feedback contracts', () => {
    it('blocks missing media and oversized videos before publishing', () => {
        const state = defaultWizardState();
        state.creativeData.creatives = [
            { id: 'test-missing', name: 'test-lost.png', needsUpload: true },
        ];
        expect(validateWizard(state, 4).some((error) => error.message.includes('Re-upload'))).toBe(
            true,
        );
        state.creativeData.creatives = [
            {
                id: 'test-large',
                name: 'test-large.mp4',
                mediaType: 'video',
                file: { type: 'video/mp4', size: 501 * 1024 * 1024 },
            },
        ];
        expect(validateWizard(state, 4).some((error) => error.message.includes('500 MB'))).toBe(
            true,
        );
    });
    it('converts money without truncation or floating point drift', () => {
        expect(moneyToMinor('19.99')).toBe(1999);
        expect(moneyToMinor('0.29')).toBe(29);
        expect(minorToMoney(1999)).toBe('19.99');
        for (const value of ['NaN', '-1', '1.001', '', '1e3'])
            expect(() => moneyToMinor(value)).toThrow();
    });
    it('interprets wall time in the account timezone independent of browser timezone', () => {
        expect(accountTimeToUtc('2026-09-10T01:00', 'America/New_York')).toBe(
            '2026-09-10T05:00:00.000Z',
        );
        expect(accountTimeToUtc('2026-01-10T01:00', 'America/New_York')).toBe(
            '2026-01-10T06:00:00.000Z',
        );
        expect(accountTimeToUtc('2026-09-10T01:00', 'Asia/Kolkata')).toBe(
            '2026-09-09T19:30:00.000Z',
        );
        expect(() => accountTimeToUtc('2026-03-08T02:30', 'America/New_York')).toThrow();
        expect(() => accountTimeToUtc('2026-11-01T01:30', 'America/New_York')).toThrow();
        expect(() => accountTimeToUtc('2026-09-10T01:00', '')).toThrow();
        expect(tomorrowInTimezone('America/New_York', new Date('2026-09-10T01:00:00Z'))).toBe(
            '2026-09-10T01:00',
        );
    });
    it('resets conversion settings when the objective changes', () => {
        expect(
            normalizeObjective('OUTCOME_LEADS', {
                optimizationGoal: 'OFFSITE_CONVERSIONS',
                conversionEvent: 'PURCHASE',
            }),
        ).toMatchObject({ optimizationGoal: 'OFFSITE_CONVERSIONS', conversionEvent: 'LEAD' });
        expect(
            normalizeObjective('OUTCOME_TRAFFIC', {
                optimizationGoal: 'OFFSITE_CONVERSIONS',
                conversionEvent: 'PURCHASE',
            }),
        ).toMatchObject({ optimizationGoal: 'LINK_CLICKS', conversionEvent: '' });
    });
    it('preserves original nonempty copy indexes, variant IDs, edits, and paused statuses', () => {
        const creative = {
            creatives: [{ id: 'one', name: 'test Creative.JPG' }],
            headlines: ['', 'Headline'],
            bodies: ['', 'Body'],
        };
        const ads = buildAdVariants(creative);
        expect(ads).toHaveLength(1);
        expect(ads[0]).toMatchObject({
            headlineIndex: 1,
            bodyIndex: 1,
            name: 'test_Creative',
            status: 'PAUSED',
        });
        expect(buildAdVariants(creative, [{ ...ads[0], name: 'test-edited' }])[0].name).toBe(
            'test-edited',
        );
        expect(stripFileExtension('test.example.final.png')).toBe('test.example.final');
    });
    it('lists missing field errors instead of silently blocking progress', () => {
        const state = defaultWizardState();
        const errors = validateWizard(state);
        expect(errors.map((e) => e.field)).toEqual(
            expect.arrayContaining([
                'selectedAdAccount',
                'campaignData.name',
                'creativeData.pageId',
                'creativeData.websiteUrl',
            ]),
        );
        expect(state.creativeData.pageId).toBe('');
    });
    it('rejects incompatible events and budgets below the account minimum', () => {
        const state = defaultWizardState();
        state.selectedAdAccount = { id: 'act_1', timezone: 'UTC', minDailyBudget: 500 };
        state.campaignData.objective = 'OUTCOME_LEADS';
        state.adsetData.dailyBudget = '4.99';
        const fields = validateWizard(state).map((e) => e.field);
        expect(fields).toContain('adsetData.conversionEvent');
        expect(fields).toContain('adsetData.dailyBudget');
    });
    it('presets omit instance IDs and media and cannot cross account boundaries', () => {
        const state = defaultWizardState();
        state.selectedAdAccount = { id: 'act_1' };
        state.campaignData.fbCampaignId = 'campaign-1';
        state.creativeData.pageId = 'page-1';
        state.creativeData.creatives = [{ file: 'test-file' }];
        const preset = presetFromState(state);
        expect(JSON.stringify(preset)).not.toContain('campaign-1');
        expect(JSON.stringify(preset)).not.toContain('test-file');
        expect(() =>
            applyPreset(
                { ...state, selectedAdAccount: { id: 'act_2' } },
                { ad_account_id: 'act_1', settings: preset },
            ),
        ).toThrow();
        expect(defaultTrackingParameters).toContain('ad_id={{ad.id}}');
        expect(defaultTrackingParameters).toContain('placement={{placement}}');
    });
});
