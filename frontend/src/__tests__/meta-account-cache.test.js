import { beforeEach, describe, expect, it } from 'vitest';
import { clearAdAccountCache, getAdAccounts } from '../lib/facebookApi';

const response = id => ({ ok: true, json: async () => [{ id, name: id }] });

beforeEach(() => {
    clearAdAccountCache();
    localStorage.getItem.mockReturnValue('test-user-token');
    fetch.mockReset();
});

describe('Meta account cache across connection changes', () => {
    it('cannot repopulate the cache with an old connection response', async () => {
        let finishOld;
        fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
        const oldRequest = getAdAccounts();
        clearAdAccountCache();
        fetch.mockResolvedValueOnce(response('act_new'));
        await getAdAccounts();
        finishOld(response('act_old'));
        await oldRequest;
        expect((await getAdAccounts()).map(account => account.id)).toEqual(['act_new']);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('keeps a newer manual sync when requests finish out of order', async () => {
        let finishOld;
        fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
        const oldRequest = getAdAccounts();
        fetch.mockResolvedValueOnce(response('act_synced'));
        await getAdAccounts(true);
        finishOld(response('act_old'));
        await oldRequest;
        expect((await getAdAccounts()).map(account => account.id)).toEqual(['act_synced']);
    });
});
