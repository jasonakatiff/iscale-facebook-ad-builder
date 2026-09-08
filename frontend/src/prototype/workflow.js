import { moneyToMinor } from '../lib/money';

export const PROTOTYPE_KEY = 'breadwinner:m0-prototype:v1';
export const SCREENS = ['research', 'brief', 'create', 'deploy', 'planner', 'review', 'job', 'reports', 'detail'];
export const CONNECTIONS = {
  loading: ['Checking connection', 'Account controls wait until connection status is known.'],
  disconnected: ['Not connected to Meta', 'Keep researching and building creatives. Connect an account when you are ready to deploy.'],
  pending: ['Connecting to Meta', 'A connection attempt is in progress. Return here after authorization.'],
  selection: ['Choose an ad account', 'Select an authorized account before configuring deployment.'],
  empty: ['No accessible ad accounts', 'This connection has no authorized advertising accounts. Ask your workspace administrator for access.'],
  connected: ['Connected', 'test-Morrow Studio · Meta account •••123 · USD · America/New_York'],
  managed: ['Connected through workspace', 'test-Morrow Studio · Meta account •••123 · USD · America/New_York. Managed by your workspace administrator.'],
  expired: ['Connection expired', 'Your saved sample build is retained. Reconnect before creating ads.'],
  revoked: ['Connection revoked', 'Access was withdrawn. Reconnect before creating ads.'],
  stale: ['Account data is stale', 'Sample last sync: September 4, 12:00 UTC. Refresh connection data before launch.'],
  error: ['Account sync failed', 'Sample provider outage. Cached settings remain available; launch waits for a successful refresh.'],
  denied: ['Workspace access removed', 'Private build controls are unavailable. Contact your workspace administrator.'],
};

export function connectionAccess(value) {
  const [label, description] = CONNECTIONS[value] || CONNECTIONS.disconnected;
  return { label, description, canConfigure: ['connected', 'managed', 'stale', 'error'].includes(value), canLaunch: ['connected', 'managed'].includes(value) };
}

export function createPrototypeState() {
  const evidence = ['Morning ritual', 'The ingredient story', 'A better afternoon'].map((title, index) => ({
    id: `test-evidence-${index + 1}`, title, advertiser: 'Morrow Coffee · fictional brand',
    retrievedAt: '2026-09-04T12:00:00Z', source: 'Sample research library',
    format: index === 2 ? 'Video storyboard' : 'Image concept',
    note: ['A recognizable routine before the product reveal.', 'Simple ingredients made the focus of the story.', 'A new occasion for the same product.'][index],
  }));
  const assets = evidence.map((item, index) => ({
    id: `test-asset-${index + 1}`, name: item.title, version: 1, evidenceId: item.id,
    headline: ['Make room for a slower morning', 'A little less, a little better', 'Meet your afternoon ritual'][index],
    body: 'A considered coffee ritual, made for everyday life.', kind: 'sample', selected: true,
  }));
  return {
    version: 1, screen: 'research', connection: 'disconnected', evidence, selectedEvidence: [], assets,
    brief: { id: 'test-brief-1', title: 'A ritual worth keeping', hypothesis: '', audience: 'Busy people looking for a simpler daily ritual', offer: 'Morrow starter collection', metric: 'Purchase conversion rate', evidence: [], reportId: null, parentAssetId: null },
    build: { id: 'test-build-1', name: 'Morrow · Morning rituals', revision: 1, source: 'manual', distribution: 'split', dailyBudget: '19.99', audience: 'Broad prospecting', groupAudiences: {}, headlines: ['Make room for a slower morning', 'Your daily ritual, reimagined'], bodies: ['A considered coffee ritual, made for everyday life.', 'Start with one small moment that is yours.'], destinations: ['https://example.com/starter', 'https://example.com/ritual'], assetIds: assets.map(asset => asset.id), evidence: [] },
    preview: null, job: null, conflict: null,
    report: { id: 'test-report-1', sample: true, period: 'Sep 1–4, 2026', attribution: '7-day click · sample purchases', rows: [
      { assetId: 'test-asset-1', spendMinor: 12000, purchases: 8, impressions: 8200, clicks: 160, eligible: true },
      { assetId: 'test-asset-2', spendMinor: 9800, purchases: 4, impressions: 6500, clicks: 130, eligible: true },
      { assetId: 'test-asset-3', spendMinor: 1400, purchases: 0, impressions: 720, clicks: 12, eligible: false },
    ] },
  };
}

export function resolvePreview(state) {
  const { build } = state;
  const dailyBudgetMinor = moneyToMinor(build.dailyBudget);
  if (dailyBudgetMinor < 500) throw new Error('Daily budget must be at least $5.00 in this sample account.');
  const assets = state.assets.filter(asset => build.assetIds.includes(asset.id));
  if (!assets.length) throw new Error('Select at least one creative.');
  const headlines = build.headlines.map(text => text.trim()).filter(Boolean);
  const bodies = build.bodies.map(text => text.trim()).filter(Boolean);
  if (!headlines.length || !bodies.length) throw new Error('Enter at least one headline and one body.');
  for (const destination of build.destinations) {
    try { if (new URL(destination).protocol !== 'https:') throw new Error(); }
    catch { throw new Error('Each destination must be a complete HTTPS URL.'); }
  }
  if (!build.destinations.length) throw new Error('Enter at least one destination.');
  const groupCount = build.distribution === 'single' ? 1 : 2;
  if (!Number.isSafeInteger(dailyBudgetMinor * groupCount)) throw new Error('Combined budget is too large.');
  const adSets = Array.from({ length: groupCount }, (_, index) => ({
    id: `test-group-${index + 1}`, name: `Ad set ${index + 1}`, dailyBudgetMinor, status: 'PAUSED', adCount: 0,
    audience: build.groupAudiences[`test-group-${index + 1}`] ?? build.audience,
  }));
  const ads = [];
  assets.forEach((asset, assetIndex) => {
    const groups = build.distribution === 'duplicate' ? adSets : [adSets[assetIndex % groupCount]];
    for (const group of groups) {
      headlines.forEach((headline, h) => bodies.forEach((body, b) => build.destinations.forEach((destination, d) => {
        ads.push({ id: `${build.id}:${group.id}:${asset.id}:${h}:${b}:${d}`, assetId: asset.id, name: `${asset.name} · H${h + 1}/B${b + 1}/D${d + 1}`, groupId: group.id, headline: asset.copyOverride ? asset.headline : headline, body: asset.copyOverride ? asset.body : body, destination, status: 'PAUSED' });
        group.adCount += 1;
      })));
    }
  });
  return { buildId: build.id, revision: build.revision, name: build.name, ads, adSets, dailyBudgetMinor: dailyBudgetMinor * groupCount, status: 'PAUSED', currency: 'USD', timezone: 'America/New_York', evidence: structuredClone(build.evidence) };
}

export function summarizeJob(job) {
  const result = { confirmed: 0, unknown: 0, remaining: 0, cancelled: 0 };
  for (const operation of job?.operations || []) result[operation.state] += 1;
  return result;
}

function editBuild(state, patch) {
  return { ...state, build: { ...state.build, ...patch, revision: state.build.revision + 1 }, preview: null };
}

export function reducePrototype(state, action) {
  switch (action.type) {
    case 'screen': return { ...state, screen: SCREENS.includes(action.value) ? action.value : 'research' };
    case 'connection': return { ...state, connection: action.value, preview: null };
    case 'selectEvidence': return { ...state, selectedEvidence: state.selectedEvidence.includes(action.id) ? state.selectedEvidence.filter(id => id !== action.id) : [...state.selectedEvidence, action.id] };
    case 'createBrief': return { ...state, screen: 'brief', brief: { ...state.brief, evidence: state.evidence.filter(item => state.selectedEvidence.includes(item.id)) } };
    case 'updateBrief': return { ...state, brief: { ...state.brief, ...action.patch } };
    case 'asset': return editBuild({ ...state, assets: state.assets.map(asset => asset.id === action.id ? { ...asset, ...action.patch } : asset) }, {});
    case 'upload': return { ...state, assets: [...state.assets, ...action.assets] };
    case 'prepareBuild': return { ...editBuild(state, { assetIds: state.assets.filter(asset => asset.selected).map(asset => asset.id), evidence: structuredClone(state.brief.evidence) }), screen: 'deploy' };
    case 'updateBuild': return editBuild(state, action.patch);
    case 'groupAudience': return editBuild(state, { groupAudiences: { ...state.build.groupAudiences, [action.id]: action.value } });
    case 'preview': {
      if (!connectionAccess(state.connection).canLaunch) throw new Error('Connect or refresh the sample account before review.');
      if (state.conflict) throw new Error('Resolve the edit conflict before review.');
      return { ...state, screen: 'review', preview: resolvePreview(state) };
    }
    case 'launch': {
      if (!connectionAccess(state.connection).canLaunch || state.conflict || !state.preview || state.preview.revision !== state.build.revision || state.preview.buildId !== state.build.id) throw new Error('Refresh review before simulated creation.');
      if (state.job && summarizeJob(state.job).unknown) throw new Error('Reconcile the unknown sample result before another launch.');
      if (state.job?.plan.buildId === state.preview.buildId && state.job.plan.revision === state.preview.revision) return { ...state, screen: 'job' };
      const plan = structuredClone(state.preview);
      return { ...state, screen: 'job', job: { id: `test-job-${plan.buildId}-${plan.revision}`, plan, operations: plan.ads.map(ad => ({ id: ad.id, state: 'remaining' })), cancelled: false } };
    }
    case 'partial': {
      if (!state.job || state.job.cancelled) return state;
      return { ...state, job: { ...state.job, operations: state.job.operations.map((op, index) => op.state !== 'remaining' ? op : { ...op, state: index < 8 ? 'confirmed' : index === 8 ? 'unknown' : 'remaining' }) } };
    }
    case 'cancelJob': return !state.job ? state : { ...state, job: { ...state.job, cancelled: true, operations: state.job.operations.map(op => op.state === 'remaining' ? { ...op, state: 'cancelled' } : op) } };
    case 'completeJob': {
      if (!state.job) return state;
      if (summarizeJob(state.job).unknown) throw new Error('Reconcile unknown outcomes first.');
      return { ...state, job: { ...state.job, operations: state.job.operations.map(op => op.state === 'remaining' ? { ...op, state: 'confirmed' } : op) } };
    }
    case 'reconcileJob': return !state.job ? state : { ...state, job: { ...state.job, operations: state.job.operations.map(op => op.state === 'unknown' ? { ...op, state: 'confirmed' } : op) } };
    case 'conflict': return { ...state, preview: null, conflict: { name: 'Morrow · Revised by Alex', revision: state.build.revision + 1 } };
    case 'forkBuild': return { ...editBuild(state, { id: `${state.build.id}-fork-${state.build.revision}`, name: `${state.build.name} · My copy` }), conflict: null };
    case 'loadRemote': return !state.conflict ? state : { ...editBuild(state, { name: state.conflict.name }), conflict: null };
    case 'nextBrief': return { ...state, screen: 'brief', brief: { ...state.brief, id: `${state.brief.id}-next`, title: 'Next test · Make the routine visible', hypothesis: 'Next test: show the morning routine before the product reveal. Compare purchase conversion rate with the original concept.', reportId: state.report.id, parentAssetId: action.assetId } };
    default: return state;
  }
}
