import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, FlaskConical, Layers, Link2, Search, SlidersHorizontal, Sparkles, Upload, Workflow } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useToast } from '../context/ToastContext';
import { minorToMoney } from '../lib/money';
import { CONNECTIONS, PROTOTYPE_KEY, SCREENS, connectionAccess, createPrototypeState, reducePrototype, resolvePreview, summarizeJob } from './workflow';

const SCREEN_NAMES = { research: 'Research', brief: 'Brief editor', create: 'Creative Building', deploy: 'Ad Deployment', planner: 'Campaign planner', review: 'Review exact launch', job: 'Launch detail', reports: 'Performance Reports', detail: 'Creative performance' };
const STAGES = [
  { screen: 'research', label: 'Research', icon: Search, screens: ['research', 'brief'] },
  { screen: 'create', label: 'Creative Building', icon: Layers, screens: ['create'] },
  { screen: 'deploy', label: 'Ad Deployment', icon: Workflow, screens: ['deploy', 'planner', 'review', 'job'] },
  { screen: 'reports', label: 'Performance Reports', icon: SlidersHorizontal, screens: ['reports', 'detail'] },
];
const dollars = minor => `$${minorToMoney(minor)}`;

function restore() {
  const initial = createPrototypeState();
  try {
    const saved = JSON.parse(localStorage.getItem(PROTOTYPE_KEY));
    if (saved?.version === 1 && saved.build?.assetIds && saved.brief?.evidence && Array.isArray(saved.assets) && saved.report?.rows) {
      const screen = location.hash.slice(1);
      return { ...saved, screen: SCREENS.includes(screen) ? screen : saved.screen };
    }
  } catch { /* Corrupt or unavailable prototype storage starts a new sample session. */ }
  const screen = location.hash.slice(1);
  return { ...initial, screen: SCREENS.includes(screen) ? screen : initial.screen };
}

function Field({ label, children, hint }) {
  return <label className="p-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Chip({ children, tone = '' }) {
  return <span className={`p-chip ${tone}`}>{children}</span>;
}

function Artwork({ index = 0, compact = false }) {
  const variants = [
    { bg: '#e9e3d7', ink: '#304d40', accent: '#f7f3e9', text: 'A moment,\njust for you.', small: 'THE MORNING RITUAL' },
    { bg: '#c6d1b4', ink: '#243a2b', accent: '#f0eadc', text: 'Good things.\nSimply made.', small: 'THE INGREDIENT STORY' },
    { bg: '#d4c8b9', ink: '#4a332b', accent: '#e8cba0', text: 'A softer\nafternoon.', small: 'A DIFFERENT OCCASION' },
  ];
  const art = variants[index % variants.length];
  return <svg className={`p-artwork ${compact ? 'compact' : ''}`} viewBox="0 0 420 440" role="img" aria-label={`${art.small.toLowerCase()} — fictional Morrow creative`}>
    <rect width="420" height="440" fill={art.bg} />
    <path d="M0 350 Q180 265 420 320 V440 H0Z" fill={art.accent} />
    <text x="30" y="40" fill={art.ink} fontSize="11" letterSpacing="2">MORROW / COFFEE &amp; EVERYDAY RITUALS</text>
    {art.text.split('\n').map((line, i) => <text key={line} x="30" y={94 + i * 42} fill={art.ink} fontFamily="Georgia, serif" fontSize="39">{line}</text>)}
    <ellipse cx="252" cy="386" rx="112" ry="13" fill={art.ink} opacity=".12" />
    <g transform={index % 2 ? 'translate(35,8) rotate(-6,220,300)' : 'translate(0,0)'}>
      <path d="M180 191 L306 191 L318 379 L167 379 Z" fill={art.ink} />
      <path d="M180 191 L306 191 L299 213 L185 213Z" fill={art.accent} opacity=".45" />
      <rect x="182" y="240" width="119" height="94" rx="1" fill={art.accent} />
      <text x="194" y="272" fill={art.ink} fontFamily="Georgia, serif" fontSize="25">morrow.</text>
      <path d="M194 286 H288" stroke={art.ink} strokeWidth=".7" />
      <text x="194" y="303" fill={art.ink} fontSize="8" letterSpacing="1.4">YOUR DAILY PAUSE</text>
      <text x="194" y="319" fill={art.ink} fontSize="7">COFFEE · SAMPLE PACKAGING</text>
    </g>
    <circle cx="100" cy="340" r="47" fill={art.ink} opacity=".8" />
    <circle cx="100" cy="335" r="38" fill={art.accent} />
    <circle cx="100" cy="335" r="30" fill="#704d36" />
    <path d="M145 324 Q175 320 153 350" fill="none" stroke={art.ink} strokeWidth="10" />
    <text x="30" y="417" fill={art.ink} fontSize="10" letterSpacing="1.5">{art.small} · SAMPLE CONCEPT</text>
  </svg>;
}

function HistoryStrip({ state, go }) {
  const evidence = state.brief.evidence[0];
  const steps = [
    ['research', evidence?.title || 'Choose evidence'],
    ['brief', state.brief.reportId ? 'Next brief' : 'Creative brief'],
    ['create', `${state.assets.length} creatives`],
    ['planner', `Build · r${state.build.revision}`],
    ['reports', state.brief.reportId ? 'Sample report → next test' : 'Sample results'],
  ];
  return <div className="p-history" data-testid="creative-history" aria-label="Creative history"><Link2 size={15} /><span className="p-history-title">Creative history</span>{steps.map(([screen, label]) => <span key={screen}><ChevronRight size={12} /><button onClick={() => go(screen)}>{label}</button></span>)}</div>;
}

function Heading({ title, children, description }) {
  return <div className="p-heading"><div><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div><div className="p-actions">{children}</div></div>;
}

function Empty({ title, children }) {
  return <div className="p-empty"><CircleHelp size={24} /><h2>{title}</h2>{children}</div>;
}

function Research({ state, send }) {
  const [query, setQuery] = useState('');
  const [dataState, setDataState] = useState('ready');
  const [inspected, setInspected] = useState(null);
  const filtered = state.evidence.filter(item => `${item.title} ${item.note}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <Heading title="Find the next creative test" description="Collect an idea. Keep the evidence. Give it a brief.">
      <Chip>3 sample references</Chip>
    </Heading>
    <div className="p-toolbar"><Field label="Search research"><input type="search" placeholder="Search a concept or hook" value={query} onChange={event => setQuery(event.target.value)} /></Field>
      <Field label="Research data"><select value={dataState} onChange={event => setDataState(event.target.value)}><option value="ready">Sample results</option><option value="loading">Loading</option><option value="empty">Empty library</option><option value="error">Provider failure</option></select></Field>
      <span className="p-muted">Morrow · All formats · Observed Sep 4</span>
    </div>
    {dataState === 'loading' ? <Empty title="Searching the sample library"><p role="status">Loading scenario. Choose Sample results to continue.</p></Empty> : dataState === 'empty' ? <Empty title="Your research starts here"><p>Search a brand or topic to build your first evidence collection.</p><button onClick={() => setDataState('ready')}>Load sample references</button></Empty> : <>
      {dataState === 'error' && <div className="p-notice warning" role="status">Sample provider unavailable. Showing cached references from Sep 4, 12:00 UTC. <button onClick={() => setDataState('ready')}>Retry sample search</button></div>}
      {!filtered.length && <Empty title="No matching references"><button onClick={() => setQuery('')}>Clear filters</button></Empty>}
      <div className="p-evidence-grid">{filtered.map(item => <article className={`p-evidence ${state.selectedEvidence.includes(item.id) ? 'selected' : ''}`} key={item.id}>
        <div className="p-art-wrap"><Artwork index={state.evidence.indexOf(item)} /><label className="p-select-art"><input type="checkbox" checked={state.selectedEvidence.includes(item.id)} onChange={() => send({ type: 'selectEvidence', id: item.id })} aria-label={`Select ${item.title}`} /></label><span className="p-format">{item.format}</span></div>
        <div className="p-card-content"><h2><button className="p-text-button" onClick={() => setInspected(inspected === item.id ? null : item.id)}>{item.title}</button></h2><p>{item.note}</p><div className="p-card-meta"><span>Fictional brand · Sample source</span><span>Sep 4</span></div>
          {inspected === item.id && <div className="p-note">{item.source} · Retrieved {item.retrievedAt}. Observation only; no competitor spend or performance is available.</div>}
        </div>
      </article>)}</div>
    </>}
    <div className="p-selection-tray"><span><strong>{state.selectedEvidence.length}</strong> references selected <small>Original source and date travel with your brief.</small></span><button className="primary" disabled={!state.selectedEvidence.length} onClick={() => send({ type: 'createBrief' })}>Create brief <ArrowRight size={16} /></button></div>
  </>;
}

function Brief({ state, send, go }) {
  const edit = (key, value) => send({ type: 'updateBrief', patch: { [key]: value } });
  return <>
    <Heading title={state.brief.reportId ? 'Turn a finding into the next test' : 'Give this idea a clear brief'} description="Make the hypothesis specific before making more creative.">
      <button onClick={() => send({ type: 'updateBrief', patch: {} })}>Save sample brief</button><button className="primary" onClick={() => go('create')}>Build creatives <ArrowRight size={16} /></button>
    </Heading>
    <div className="p-document-layout"><section className="p-panel p-document">
      <Field label="Brief title"><input value={state.brief.title} onChange={event => edit('title', event.target.value)} /></Field>
      <Field label="Hypothesis" hint="What changes, for whom, and what result will tell you it worked?"><textarea rows={4} placeholder="Showing the ritual before the product will…" value={state.brief.hypothesis} onChange={event => edit('hypothesis', event.target.value)} /></Field>
      <Field label="Audience and problem"><textarea rows={2} value={state.brief.audience} onChange={event => edit('audience', event.target.value)} /></Field>
      <div className="p-two-fields"><Field label="Product and offer"><input value={state.brief.offer} onChange={event => edit('offer', event.target.value)} /></Field><Field label="Success metric"><select value={state.brief.metric} onChange={event => edit('metric', event.target.value)}><option>Purchase conversion rate</option><option>Cost per purchase</option><option>Click-through rate</option></select></Field></div>
      <div className="p-note"><Sparkles size={16} />Generation adapters are outside this prototype. Your authored brief stays editable.</div>
    </section><aside className="p-panel p-evidence-rail"><h2>Evidence behind the brief</h2>{!state.brief.evidence.length && <p>No references selected. A brief can start with your own idea.</p>}{state.brief.evidence.map(item => <div key={item.id}><Artwork index={state.evidence.findIndex(source => source.id === item.id)} compact /><h3>{item.title}</h3><p>{item.note}</p><small>Retrieved Sep 4, 2026 · {item.source}</small></div>)}{state.brief.reportId && <div className="p-note"><strong>Sample report</strong><p>{state.brief.reportId} · Original creative: {state.brief.parentAssetId}</p></div>}</aside></div>
  </>;
}

function Creatives({ state, send, media, upload }) {
  const [selectedId, setSelectedId] = useState(state.assets[0]?.id);
  const [compare, setCompare] = useState(false);
  const [mode, setMode] = useState('Upload');
  const selected = state.assets.find(asset => asset.id === selectedId) || state.assets[0];
  const chosen = state.assets.filter(asset => asset.selected);
  const renderAsset = asset => media[asset.id] ? (asset.mime?.startsWith('video/') ? <video controls src={media[asset.id]} /> : <img src={media[asset.id]} alt={asset.name} />) : asset.kind === 'upload' ? <Empty title={asset.name}><p>Select the file again to restore its preview.</p></Empty> : <Artwork index={state.assets.indexOf(asset)} />;
  return <>
    <Heading title="A ritual worth keeping" description="One brief. A batch of ideas. Keep every version connected."><button onClick={() => setCompare(!compare)} aria-pressed={compare}>{compare ? 'Exit comparison' : 'Compare selected'}</button><button className="primary" disabled={!chosen.length} onClick={() => send({ type: 'prepareBuild' })}>Prepare deployment <ArrowRight size={16} /></button></Heading>
    <div className="p-creative-workspace"><aside className="p-panel p-source-rail"><h2>Sources</h2><button onClick={() => send({ type: 'screen', value: 'brief' })}><BookOpen size={16} /> Creative brief</button><label className="p-upload"><Upload size={16} /> Upload finished creatives<input type="file" accept="image/*,video/*" multiple onChange={upload} aria-label="Upload finished creatives" /></label><div className="p-mode-list">{['Upload', 'Image', 'Video', 'Remix'].map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</button>)}</div><p>{mode === 'Upload' ? 'Images and videos stay on this device. Sample assets are ready to compare.' : `${mode} generation is a prototype mode. No model requests are sent.`}</p><small>{state.brief.evidence.length} source references</small></aside>
      <section className={`p-stage ${compare ? 'comparison' : ''}`} aria-label="Creative stage">{(compare ? chosen : [selected]).filter(Boolean).map(asset => <figure key={asset.id}>{renderAsset(asset)}<figcaption>{asset.name} · v{asset.version}<span>Sample preview · 1:1 concept</span></figcaption></figure>)}</section>
      <aside className="p-panel p-inspector"><span className="p-overline">Selected creative</span><h2>{selected?.name || 'Select a creative'}</h2>{selected && <><Chip>Version {selected.version}</Chip><Field label="Creative name"><input value={selected.name} onChange={event => send({ type: 'asset', id: selected.id, patch: { name: event.target.value } })} /></Field><label className="p-checkbox"><input type="checkbox" checked={!!selected.copyOverride} onChange={event => send({ type: 'asset', id: selected.id, patch: { copyOverride: event.target.checked } })} /> Override shared copy</label><Field label="Creative headline"><textarea value={selected.headline} onChange={event => send({ type: 'asset', id: selected.id, patch: { headline: event.target.value, copyOverride: true } })} /></Field><Field label="Creative body"><textarea rows={3} value={selected.body} onChange={event => send({ type: 'asset', id: selected.id, patch: { body: event.target.value, copyOverride: true } })} /></Field><p className="p-note">Copy edits apply to this creative when its override is enabled. Shared combinations remain visible in the planner.</p></>}</aside>
    </div>
    <div className="p-batch-heading"><h2>Creative batch <span>{state.assets.length}</span></h2><span>{chosen.length} selected · Separate ads</span></div><div className="p-filmstrip">{state.assets.map(asset => <article key={asset.id} className={selected?.id === asset.id ? 'selected' : ''}><button className="p-thumbnail" aria-label={`Edit ${asset.name}`} onClick={() => setSelectedId(asset.id)}>{asset.kind === 'sample' ? <Artwork index={state.assets.indexOf(asset)} compact /> : <span><Upload size={22} />{asset.name}</span>}</button><label><input type="checkbox" checked={asset.selected} onChange={event => send({ type: 'asset', id: asset.id, patch: { selected: event.target.checked } })} />{asset.name}</label></article>)}</div>
    {state.assets.some(asset => asset.kind === 'upload' && !media[asset.id]) && selected?.kind !== 'upload' && <p className="p-notice warning">Select the file again to restore its preview.</p>}
  </>;
}

function ConnectionCard({ state, send }) {
  const access = connectionAccess(state.connection);
  return <section className={`p-panel p-connection ${access.canLaunch ? 'connected' : ''}`}><div className="p-provider">m</div><div><h2>{access.label}</h2><p>{access.description}</p></div>
    {['disconnected', 'expired', 'revoked', 'pending'].includes(state.connection) && <button className="primary" onClick={() => send({ type: 'connection', value: state.connection === 'pending' ? 'selection' : 'pending' })}>{state.connection === 'pending' ? 'Continue sample connection' : 'Simulate connection'}</button>}
    {state.connection === 'selection' && <button onClick={() => send({ type: 'connection', value: 'connected' })}>Select test-Morrow · •••123</button>}
    {['stale', 'error', 'loading'].includes(state.connection) && <button onClick={() => send({ type: 'connection', value: 'managed' })}>Refresh sample connection</button>}
  </section>;
}

function Deploy({ state, send, go }) {
  const access = connectionAccess(state.connection);
  return <><Heading title="From ready creative to reviewed launch" description="Keep your builds, exact previews and launch history together." /><ConnectionCard state={state} send={send} />
    {access.canConfigure ? <><div className="p-tabs"><strong>Builds</strong><button onClick={() => go('job')}>Launches {state.job ? '1' : '0'}</button><span className="p-muted">Meta · USD</span></div><article className="p-build-row"><div className="p-build-thumb"><Artwork compact /></div><div><h2>{state.build.name}</h2><p>{state.build.assetIds.length} creatives · Revision {state.build.revision} · Saved in this browser</p><Chip>Needs review</Chip></div><button className="primary" onClick={() => go('planner')}>Open campaign planner <ArrowRight size={16} /></button></article>{state.job && <button onClick={() => go('job')}>Resume sample launch detail</button>}</> : <Empty title={state.connection === 'denied' ? 'Deployment access unavailable' : 'Your creative work can continue'}><p>Research and creative building stay available without a deployment account.</p><button onClick={() => go('create')}>Return to creative building</button></Empty>}
  </>;
}

function Planner({ state, send, go }) {
  const [node, setNode] = useState('campaign');
  const access = connectionAccess(state.connection);
  let plan, issue;
  try { plan = resolvePreview(state); } catch (error) { issue = error.message; }
  if (!access.canConfigure) return <Deploy state={state} send={send} go={go} />;
  const group = plan?.adSets.find(item => item.id === node);
  const edit = patch => send({ type: 'updateBuild', patch });
  return <><Heading title="Arrange the next test" description="Select a node to inspect its settings. The preview uses this exact tree."><button onClick={() => send({ type: 'conflict' })}>Simulate edit conflict</button><button className="primary" disabled={!!issue || !!state.conflict || !access.canLaunch} onClick={() => send({ type: 'preview' })}>Review launch <ArrowRight size={16} /></button></Heading>
    {state.conflict && <div className="p-notice warning" role="alert"><div><strong>Another editor saved a newer version</strong><p>Your title: {state.build.name}<br />Alex’s title: {state.conflict.name}. Your local changes are preserved.</p></div><button onClick={() => send({ type: 'forkBuild' })}>Fork my changes</button></div>}
    {!access.canLaunch && <div className="p-notice warning">{access.label}. Refresh the sample connection before review.</div>}
    <div className="p-toolbar"><Field label="Build name"><input value={state.build.name} onChange={event => edit({ name: event.target.value })} /></Field><Field label="Setup source"><select value={state.build.source} onChange={event => edit({ source: event.target.value })}><option value="manual">Manual setup</option><option value="existing">Existing sample ad · Sep 4 snapshot</option><option value="preset">Morrow prospecting preset</option></select></Field><Field label="Distribution"><select value={state.build.distribution} onChange={event => edit({ distribution: event.target.value })}><option value="single">Single ad set</option><option value="split">Split creatives across 2 ad sets</option><option value="duplicate">Duplicate all creatives into 2 ad sets</option></select></Field></div>
    <div className="p-plan-summary"><strong data-testid="ad-count">1 campaign · {plan?.adSets.length ?? '—'} ad sets · {plan?.ads.length ?? '—'} ads</strong><span>{state.build.assetIds.length} media × {state.build.headlines.filter(Boolean).length} headlines × {state.build.bodies.filter(Boolean).length} bodies × {state.build.destinations.length} destinations{state.build.distribution === 'duplicate' ? ' × 2 copies' : ''}</span></div>
    <div className="p-planner"><aside className="p-panel p-tree"><h2>Campaign structure</h2><button className={node === 'campaign' ? 'selected' : ''} onClick={() => setNode('campaign')}><Layers size={15} />Morrow · Sales<Chip>New</Chip></button>{(plan?.adSets || [{ id: 'test-group-1', adCount: 0 }, { id: 'test-group-2', adCount: 0 }]).map((item, index) => <div key={item.id}><button aria-label={`Select ad set ${index + 1}`} className={node === item.id ? 'selected' : ''} onClick={() => setNode(item.id)}><ChevronRight size={14} />Ad set {index + 1}<small>{item.adCount} ads</small></button><p>↳ {index === 0 ? 'Morning ritual + afternoon' : 'Ingredient story'}</p></div>)}<div className="p-note">{state.build.distribution === 'duplicate' ? 'Every creative repeats in both ad sets.' : state.build.distribution === 'split' ? 'Each logical creative belongs to one ad set. Its copy and destination variants stay together.' : 'Every creative is in one ad set.'}</div></aside>
      <section className="p-panel p-matrix"><div className="p-panel-heading"><h2>Ad matrix</h2><Chip>All new objects PAUSED</Chip></div><div className="p-table-scroll"><table><thead><tr><th>Creative / variant</th><th>Headline</th><th>Destination</th><th>Ad set</th></tr></thead><tbody>{(plan?.ads || []).map(ad => <tr key={ad.id}><td><strong>{ad.name}</strong></td><td>{ad.headline}</td><td>{new URL(ad.destination).pathname}</td><td>{ad.groupId.endsWith('1') ? '1' : '2'}</td></tr>)}</tbody></table></div></section>
      <aside className="p-panel p-inspector"><span className="p-overline">{group ? group.name : 'Campaign defaults'}</span><h2>{group ? 'Audience and delivery' : 'Shared settings'}</h2><Chip>{state.build.source === 'manual' ? 'Manual values' : 'Inherited from sample source'}</Chip>
        {group ? <><Field label="Audience override"><input placeholder={state.build.audience} value={state.build.groupAudiences[group.id] ?? ''} onChange={event => send({ type: 'groupAudience', id: group.id, value: event.target.value || null })} /></Field><p data-testid="selected-audience">Resolved audience: <strong>{group.audience}</strong></p><button onClick={() => send({ type: 'groupAudience', id: group.id, value: null })}>Reset to source</button></> : <Field label="Shared audience"><input value={state.build.audience} onChange={event => edit({ audience: event.target.value })} /></Field>}
        <Field label="Daily budget per ad set" hint="USD · Sample minimum $5.00. Ad sets own their budgets."><input inputMode="decimal" value={state.build.dailyBudget} onChange={event => edit({ dailyBudget: event.target.value })} /></Field>
        <Field label="Shared headlines" hint="One per line. Blank lines are ignored."><textarea rows={3} value={state.build.headlines.join('\n')} onChange={event => edit({ headlines: event.target.value.split('\n') })} /></Field><Field label="Shared bodies"><textarea rows={4} value={state.build.bodies.join('\n')} onChange={event => edit({ bodies: event.target.value.split('\n') })} /></Field>
        <Field label="Destination URLs"><textarea rows={3} value={state.build.destinations.join('\n')} onChange={event => edit({ destinations: event.target.value.split('\n').filter(Boolean) })} /></Field><small>Page: Morrow sample Page · Instagram: @morrow_sample · US, excluding California · Facebook Feed + Instagram Stories</small>
      </aside></div>{issue && <div className="p-notice warning" role="alert">{issue}</div>}
  </>;
}

function Review({ state, send, go, confirm }) {
  const plan = state.preview;
  if (!plan) return <><Heading title="Review exact launch" /><Empty title="A fresh review is required"><p>Build or connection changes invalidate the previous review. Return to the planner to resolve the current settings.</p><button onClick={() => go('planner')}>Return to planner</button></Empty></>;
  return <><Heading title="Review exact launch" description={`test-Morrow · Meta •••123 · USD · America/New_York · Revision ${plan.revision}`}><button onClick={() => go('planner')}>Return to editing</button></Heading>
    <div className="p-notice"><Check size={18} /><span><strong>Ready for simulated paused creation.</strong> No platform objects have been created. This preview is tied to revision {plan.revision}.</span></div>
    <div className="p-review-layout"><section className="p-panel"><div className="p-panel-heading"><h2>Exact distribution</h2><strong>{plan.ads.length} new ads</strong></div>{plan.adSets.map(group => <article className="p-review-group" key={group.id}><div><h3>{group.name}</h3><p>{group.audience} · {group.adCount} ads</p></div><div><strong>{dollars(group.dailyBudgetMinor)} / day</strong><Chip>PAUSED</Chip></div></article>)}<div className="p-review-preview"><Artwork /><div><h3>{plan.ads[0]?.headline}</h3><p>{plan.ads[0]?.body}</p><small>Placement concept. Provider rendering can vary.</small></div></div><div className="p-note">1 new campaign PAUSED · {plan.adSets.length} new ad sets PAUSED · {plan.ads.length} new ads PAUSED. No existing parents are modified.</div></section>
      <aside className="p-panel p-review-summary"><h2>What you are creating</h2><dl><dt>Identity</dt><dd>Morrow sample Page · @morrow_sample</dd><dt>Objective / event</dt><dd>Sales · Purchase · Sample pixel</dd><dt>Locations</dt><dd>United States · Exclude California</dd><dt>Placements</dt><dd>Facebook Feed · Instagram Stories</dd><dt>Budget owners</dt><dd>{plan.adSets.length} ad sets · ABO</dd><dt>Daily configuration</dt><dd className="p-total" data-testid="budget-total">{dollars(plan.dailyBudgetMinor)} USD</dd><dt>Schedule</dt><dd>No delivery while paused. Start time is set during a separate activation flow.</dd><dt>Destinations</dt><dd>{state.build.destinations.map(url => <span className="p-url" key={url}>{url}</span>)}</dd></dl><p className="p-note">Daily configuration is not a guaranteed spend cap. This sample action cannot activate or spend money.</p><button className="primary" onClick={() => confirm({ title: 'Simulate paused creation?', message: `Create a local sample job with ${plan.ads.length} ads. No request is sent to Meta. Campaign, ad sets and ads remain PAUSED.`, confirmText: 'Simulate paused creation', action: () => send({ type: 'launch' }), destructive: false })}>Create {plan.ads.length} paused ads</button></aside></div>
  </>;
}

function Job({ state, send, go, confirm }) {
  const job = state.job;
  if (!job) return <><Heading title="Launch detail" /><Empty title="No sample launch yet"><p>Review a build before simulating creation. No background operation is running.</p><button onClick={() => go('planner')}>Open planner</button></Empty></>;
  const counts = summarizeJob(job);
  return <><Heading title={counts.unknown ? 'A launch needs reconciliation' : counts.remaining ? 'Your sample launch is queued' : job.cancelled ? 'Remaining work stopped' : 'Sample ads created paused'} description={`${job.plan.name} · Revision ${job.plan.revision} · ${job.id}`}><button onClick={() => go('reports')}>View sample report</button></Heading>
    <div className="p-notice warning"><FlaskConical size={18} /><span>Simulated job. Progress changes only when you choose a scenario below. This is not a running provider job.</span></div>
    <section className="p-panel p-job-summary" data-testid="job-summary"><div><strong>{counts.confirmed}</strong><span>{counts.confirmed} confirmed · PAUSED</span></div><div><strong>{counts.unknown}</strong><span>{counts.unknown} unknown</span></div><div><strong>{counts.remaining}</strong><span>{counts.remaining} remaining</span></div><div><strong>{counts.cancelled}</strong><span>{counts.cancelled} stopped</span></div></section>
    {!!counts.unknown && <div className="p-notice warning" role="alert"><div><strong>Meta may have accepted one request before the connection dropped.</strong><p>Check its recorded operation before another creation attempt. Confirmed objects are retained; no Retry all action is offered.</p></div><button onClick={() => send({ type: 'reconcileJob' })}>Simulate reconciliation: found paused</button></div>}
    <div className="p-toolbar"><button disabled={!counts.remaining || !!counts.unknown} onClick={() => send({ type: 'completeJob' })}>Simulate completion</button><button disabled={!counts.remaining || !!counts.unknown} onClick={() => send({ type: 'partial' })}>Simulate interrupted launch</button><button disabled={!counts.remaining} onClick={() => confirm({ title: 'Stop remaining work?', message: `${counts.confirmed} confirmed ads stay PAUSED. ${counts.unknown} unknown outcomes still require reconciliation. Only ${counts.remaining} unstarted ads will be stopped.`, confirmText: `Stop ${counts.remaining} remaining ads`, cancelText: 'Keep working', action: () => send({ type: 'cancelJob' }), destructive: false })}>Stop remaining work</button></div>
    <div className="p-panel p-table-scroll"><table><thead><tr><th>Sample operation</th><th>State</th><th>Meaning</th></tr></thead><tbody>{job.operations.map((op, index) => <tr key={op.id}><td>{job.plan.ads[index].name}</td><td><Chip tone={op.state === 'unknown' ? 'warning' : op.state === 'confirmed' ? 'success' : ''}>{op.state === 'confirmed' ? 'Created paused' : op.state === 'cancelled' ? 'Stopped' : op.state}</Chip></td><td>{op.state === 'unknown' ? 'Reconcile before any retry' : op.state === 'confirmed' ? 'No delivery or spend' : op.state === 'cancelled' ? 'No creation attempted' : 'Not yet started'}</td></tr>)}</tbody></table></div>
  </>;
}

function Reports({ state, go, setReportAsset }) {
  const [view, setView] = useState('gallery');
  const [filter, setFilter] = useState('all');
  const rows = state.report.rows.filter(row => filter === 'all' || (filter === 'eligible' ? row.eligible : !row.eligible));
  const total = rows.reduce((sum, row) => ({ spendMinor: sum.spendMinor + row.spendMinor, purchases: sum.purchases + row.purchases }), { spendMinor: 0, purchases: 0 });
  const inspect = id => { setReportAsset(id); go('detail'); };
  return <><Heading title="See the creative behind the result" description="Compare the evidence, understand the limits, decide what to test next." />
    <div className="p-notice warning"><FlaskConical size={18} /><strong>Sample performance — not live account results</strong><span>Illustrative historical data, independent of the paused sample launch.</span></div>
    <div className="p-toolbar"><span>Sep 1–4, 2026 · USD · 7-day click · Purchases</span><Field label="Evidence eligibility"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All concepts</option><option value="eligible">Eligible sample concepts</option><option value="insufficient">Insufficient evidence</option></select></Field><button aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}>Gallery</button><button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button></div>
    <div className="p-report-total"><strong>{rows.length} concepts</strong><span>{dollars(total.spendMinor)} sample spend</span><span>{total.purchases} sample purchases</span><small>Same selected records in gallery and table. No live performance claims.</small></div>
    {view === 'gallery' ? <div className="p-evidence-grid">{rows.map(row => { const asset = state.assets.find(item => item.id === row.assetId); return <article className="p-evidence" key={row.assetId}><Artwork index={state.report.rows.indexOf(row)} /><div className="p-card-content"><Chip tone={row.eligible ? 'success' : 'warning'}>{row.eligible ? 'Eligible sample' : 'Insufficient evidence'}</Chip><h2>{asset?.name}</h2><div className="p-report-numbers"><span><small>Sample spend</small><strong>{dollars(row.spendMinor)}</strong></span><span><small>Purchases</small><strong>{row.purchases}</strong></span></div><p>{row.eligible ? 'Inspect the contributing ads before choosing the next test.' : 'Too little sample evidence to rank this concept.'}</p><button onClick={() => inspect(row.assetId)}>Inspect {asset?.name} <ArrowRight size={15} /></button></div></article>; })}</div> : <div className="p-panel p-table-scroll"><table><thead><tr><th>Concept</th><th>Sample spend</th><th>Purchases</th><th>Evidence</th></tr></thead><tbody>{rows.map(row => <tr key={row.assetId}><td><button onClick={() => inspect(row.assetId)}>Inspect {state.assets.find(asset => asset.id === row.assetId)?.name}</button></td><td>{dollars(row.spendMinor)}</td><td>{row.purchases}</td><td>{row.eligible ? 'Eligible sample' : 'Insufficient evidence'}</td></tr>)}</tbody></table></div>}
  </>;
}

function Detail({ state, reportAsset, send, go }) {
  const row = state.report.rows.find(item => item.assetId === reportAsset) || state.report.rows[0];
  const asset = state.assets.find(item => item.id === row.assetId);
  return <><Heading title={asset?.name || 'Creative performance'} description="Sample evidence, contributing ads and one next-test decision."><button onClick={() => go('reports')}>Back to reports</button><button className="primary" onClick={() => send({ type: 'nextBrief', assetId: row.assetId })}>Create next brief <ArrowRight size={16} /></button></Heading><div className="p-notice warning">Sample performance — no live account data. Paused sample launches do not produce these results.</div>
    <div className="p-detail-layout"><section className="p-panel p-detail-art"><Artwork index={state.report.rows.indexOf(row)} /><h2>{asset?.headline}</h2><p>{asset?.body}</p></section><section className="p-panel p-document"><h2>What this sample supports</h2><div className="p-report-numbers"><span><small>Sample spend</small><strong>{dollars(row.spendMinor)}</strong></span><span><small>Purchases</small><strong>{row.purchases}</strong></span><span><small>Clicks</small><strong>{row.clicks}</strong></span></div><Chip tone={row.eligible ? 'success' : 'warning'}>{row.eligible ? 'Eligible for a sample comparison' : 'Insufficient evidence — do not rank'}</Chip><h3>Observation</h3><p>{row.eligible ? 'The sample records connect a clear routine-led hook with purchases. This does not establish that the hook caused the result.' : 'The sample has limited delivery and no purchases. That does not establish this concept as a loser.'}</p><h3>Proposed next test</h3><p>Show the morning routine before the product reveal. Keep offer and audience consistent; compare purchase conversion rate with the original concept.</p><h3>Contributing sample ads</h3><p className="p-code">{row.assetId}-ad-a · {row.assetId}-ad-b</p><p>Sep 1–4, 2026 · USD · 7-day click · Sample purchase goal. This snapshot is retained in the next brief.</p><div className="p-note">No fabricated retention curve, winner score or automatic budget action. Next steps remain an operator decision.</div></section></div></>;
}

export function WorkflowPrototype() {
  const [state, setState] = useState(restore);
  const [saveStatus, setSaveStatus] = useState('Sample session · browser only');
  const [confirmation, setConfirmation] = useState(null);
  const [media, setMedia] = useState({});
  const [reportAsset, setReportAsset] = useState('test-asset-1');
  const mediaRefs = useRef({});
  const main = useRef(null);
  const { showError } = useToast();
  const go = screen => { location.hash = screen; };
  const send = action => {
    try {
      const next = reducePrototype(state, action);
      setState(next);
      try { localStorage.setItem(PROTOTYPE_KEY, JSON.stringify(next)); setSaveStatus('Sample changes saved in this browser'); }
      catch { setSaveStatus('Browser storage unavailable · changes stay in this tab'); }
      if (next.screen !== state.screen) location.hash = next.screen;
    } catch (error) { showError(error.message); }
  };
  useEffect(() => {
    const navigate = () => {
      const value = location.hash.slice(1);
      if (SCREENS.includes(value)) setState(previous => ({ ...previous, screen: value }));
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { main.current?.querySelector('h1')?.focus(); }, [state.screen]);
  useEffect(() => () => { Object.values(mediaRefs.current).forEach(url => URL.revokeObjectURL(url)); }, []);
  const upload = event => {
    const files = [...event.target.files];
    if (files.some(file => !/^(image|video)\//.test(file.type) || file.size > 10 * 1024 * 1024)) { showError('Select images or videos up to 10 MB for this prototype.'); return; }
    const added = [];
    const urls = { ...mediaRefs.current };
    files.forEach(file => {
      const existing = state.assets.find(asset => asset.kind === 'upload' && asset.name === file.name && asset.size === file.size && asset.lastModified === file.lastModified);
      const id = existing?.id || `test-upload-${crypto.randomUUID()}`;
      if (urls[id]) URL.revokeObjectURL(urls[id]);
      urls[id] = URL.createObjectURL(file);
      if (!existing) added.push({ id, name: file.name, size: file.size, lastModified: file.lastModified, mime: file.type, version: 1, kind: 'upload', selected: true, headline: 'A new creative test', body: 'Sample copy', evidenceId: null });
    });
    mediaRefs.current = urls;
    setMedia(urls);
    if (added.length) send({ type: 'upload', assets: added });
    event.target.value = '';
  };
  const props = { state, send, go, confirm: setConfirmation };
  const stage = STAGES.find(item => item.screens.includes(state.screen));
  return <div className="workflow-prototype">
    <a className="p-skip" href="#prototype-main" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Skip to workspace</a>
    <div className="p-sample-bar" data-testid="sample-notice"><FlaskConical size={15} /><strong>Workflow prototype</strong><span>Sample data only · no live accounts, publishing or spend</span><span className="p-prototype-version">M0 / 01</span></div>
    <header className="p-topbar"><a className="p-wordmark" href="#research"><span className="p-mark">b.</span><span>breadwinner<small style={{ display: 'block', fontSize: 10, letterSpacing: 0 }}>by theLeadRouter.com</small></span></a><div className="p-workspace-name">Morrow Studio <span>Sample workspace</span></div><span className="p-save-status" role="status">{saveStatus}</span><ThemeSwitch /></header>
    <div className="p-shell"><nav className="p-sidebar" aria-label="Workflow stages"><span className="p-nav-label">WORKSPACE</span>{STAGES.map((item, index) => { const { screen, label, icon: Icon } = item; return <a key={screen} href={`#${screen}`} aria-current={stage?.screen === screen ? 'page' : undefined}><Icon size={18} aria-hidden="true" /><span>{label}</span><small aria-hidden="true">0{index + 1}</small></a>; })}<div className="p-sidebar-note"><Link2 size={18} /><strong>Keep the story connected.</strong><p>Evidence becomes a brief. Creative becomes a test. Results become the next idea.</p></div><div className="p-sidebar-footer"><span className="p-avatar">JS</span><div>Sample buyer<small>Internal team</small></div></div></nav>
      <div className="p-content"><div className="p-prototype-controls"><Field label="Prototype screen"><select value={state.screen} onChange={event => go(event.target.value)}>{SCREENS.map(screen => <option key={screen} value={screen}>{SCREEN_NAMES[screen]}</option>)}</select></Field><Field label="Connection scenario"><select value={state.connection} onChange={event => send({ type: 'connection', value: event.target.value })}>{Object.entries(CONNECTIONS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></Field><span>Scenario controls · local simulation</span></div>
      <HistoryStrip state={state} go={go} />
      <main ref={main} id="prototype-main" tabIndex={-1}>
        {state.screen === 'research' && <Research {...props} />}
        {state.screen === 'brief' && <Brief {...props} />}
        {state.screen === 'create' && <Creatives {...props} media={media} upload={upload} />}
        {state.screen === 'deploy' && <Deploy {...props} />}
        {state.screen === 'planner' && <Planner {...props} />}
        {state.screen === 'review' && <Review {...props} />}
        {state.screen === 'job' && <Job {...props} />}
        {state.screen === 'reports' && <Reports {...props} setReportAsset={setReportAsset} />}
        {state.screen === 'detail' && <Detail {...props} reportAsset={reportAsset} />}
      </main></div></div>
    <ConfirmationModal isOpen={!!confirmation} onClose={() => setConfirmation(null)} onConfirm={() => confirmation?.action()} title={confirmation?.title || ''} message={confirmation?.message || ''} confirmText={confirmation?.confirmText} cancelText={confirmation?.cancelText || 'Cancel'} isDestructive={confirmation?.destructive ?? false} icon={FlaskConical} />
  </div>;
}
