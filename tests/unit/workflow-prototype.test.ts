import { describe, expect, it } from 'vitest';
import { createPrototypeState, reducePrototype, resolvePreview, connectionAccess, summarizeJob } from '../../frontend/src/prototype/workflow.js';

function prepared() {
  let state = createPrototypeState();
  state = reducePrototype(state, { type: 'selectEvidence', id: 'test-evidence-1' });
  state = reducePrototype(state, { type: 'createBrief' });
  return reducePrototype(state, { type: 'prepareBuild' });
}

describe('M0 workflow prototype', () => {
  it('carries exact evidence and dates through brief and build without a connection', () => {
    const state = prepared();
    expect(state.connection).toBe('disconnected');
    expect(state.brief.evidence[0]).toMatchObject({ id: 'test-evidence-1', retrievedAt: '2026-09-04T12:00:00Z' });
    expect(state.build.evidence).toEqual(state.brief.evidence);
    expect(state.build.assetIds).toHaveLength(3);
  });
  it('expands 3 media × 2 headlines × 2 bodies × 2 destinations with unique stable IDs', () => {
    const state = prepared();
    const plan = resolvePreview(state);
    expect(plan.ads).toHaveLength(24);
    expect(new Set(plan.ads.map(ad => ad.id)).size).toBe(24);
    expect(resolvePreview(state)).toEqual(plan);
    expect(plan.adSets.map(group => group.adCount)).toEqual([16, 8]);
    expect(plan.ads.every(ad => ad.status === 'PAUSED')).toBe(true);
  });
  it('duplicates explicitly and keeps exact fractional budgets', () => {
    const state = reducePrototype(prepared(), { type: 'updateBuild', patch: { distribution: 'duplicate', dailyBudget: '19.99' } });
    const plan = resolvePreview(state);
    expect(plan.ads).toHaveLength(48);
    expect(plan.adSets.map(group => group.dailyBudgetMinor)).toEqual([1999, 1999]);
    expect(plan.dailyBudgetMinor).toBe(3998);
  });
  it.each(['-1', '19.999', 'NaN', '0', '99999999999999999'])('rejects invalid daily budget %s', dailyBudget => {
    expect(() => resolvePreview(reducePrototype(prepared(), { type: 'updateBuild', patch: { dailyBudget } }))).toThrow();
  });
  it('clears preview after an edit and refuses stale simulated creation', () => {
    let state = reducePrototype(prepared(), { type: 'connection', value: 'managed' });
    state = reducePrototype(state, { type: 'preview' });
    const oldPreview = state.preview;
    state = reducePrototype(state, { type: 'updateBuild', patch: { audience: 'Existing customers' } });
    expect(state.preview).toBeNull();
    expect(() => reducePrototype({ ...state, preview: oldPreview }, { type: 'launch' })).toThrow(/review/i);
  });
  it.each(['loading', 'disconnected', 'pending', 'selection', 'empty', 'expired', 'revoked', 'denied'])('hides build controls for %s', connection => {
    expect(connectionAccess(connection).canConfigure).toBe(false);
    expect(connectionAccess(connection).canLaunch).toBe(false);
  });
  it('allows workspace configuration, labels managed ownership and blocks stale launch', () => {
    expect(connectionAccess('managed')).toMatchObject({ canConfigure: true, canLaunch: true, label: 'Connected through workspace' });
    expect(connectionAccess('stale')).toMatchObject({ canConfigure: true, canLaunch: false });
  });
  it('freezes the submitted plan and preserves unknown outcomes on cancellation', () => {
    let state = reducePrototype(prepared(), { type: 'connection', value: 'managed' });
    state = reducePrototype(state, { type: 'preview' });
    state = reducePrototype(state, { type: 'launch' });
    state = reducePrototype(state, { type: 'partial' });
    expect(summarizeJob(state.job)).toMatchObject({ confirmed: 8, unknown: 1, remaining: 15 });
    state = reducePrototype(state, { type: 'cancelJob' });
    expect(summarizeJob(state.job)).toMatchObject({ confirmed: 8, unknown: 1, remaining: 0, cancelled: 15 });
    expect(() => reducePrototype(state, { type: 'completeJob' })).toThrow(/unknown/i);
    const job = state.job;
    state = reducePrototype(state, { type: 'updateBuild', patch: { dailyBudget: '25.00' } });
    expect(state.job).toEqual(job);
    expect(state.job.plan.dailyBudgetMinor).toBe(3998);
    state = reducePrototype(state, { type: 'reconcileJob' });
    expect(summarizeJob(state.job)).toMatchObject({ confirmed: 9, unknown: 0, cancelled: 15 });
  });
  it('preserves local edits by forking a conflicting build and invalidates review', () => {
    let state = reducePrototype(prepared(), { type: 'updateBuild', patch: { name: 'test-local draft' } });
    const id = state.build.id;
    state = reducePrototype(state, { type: 'conflict' });
    expect(state.build.name).toBe('test-local draft');
    state = reducePrototype(state, { type: 'forkBuild' });
    expect(state.build.id).not.toBe(id);
    expect(state.build.name).toContain('test-local draft');
    expect(state.conflict).toBeNull();
    expect(state.preview).toBeNull();
  });
  it('applies group overrides without changing another group and resets inheritance', () => {
    let state = reducePrototype(prepared(), { type: 'groupAudience', id: 'test-group-2', value: 'Past purchasers' });
    expect(resolvePreview(state).adSets.map(group => group.audience)).toEqual(['Broad prospecting', 'Past purchasers']);
    state = reducePrototype(state, { type: 'groupAudience', id: 'test-group-2', value: null });
    expect(resolvePreview(state).adSets.map(group => group.audience)).toEqual(['Broad prospecting', 'Broad prospecting']);
  });
  it('keeps source report and creative lineage in a next brief without inventing live results', () => {
    const state = reducePrototype(prepared(), { type: 'nextBrief', assetId: 'test-asset-1' });
    expect(state.brief.reportId).toBe('test-report-1');
    expect(state.brief.parentAssetId).toBe('test-asset-1');
    expect(state.brief.evidence[0].id).toBe('test-evidence-1');
    expect(state.brief.hypothesis).toMatch(/test/i);
    expect(state.report.sample).toBe(true);
  });
});
