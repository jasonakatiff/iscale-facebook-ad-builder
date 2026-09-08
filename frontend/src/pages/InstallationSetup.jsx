import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Package, Plus, Sparkles } from 'lucide-react';
import { useInstallation } from '../context/InstallationContext';
import { useBrands } from '../context/BrandContext';
import { useToast } from '../context/ToastContext';
import { ProviderConnections } from '../components/ProviderConnections';
import BrandForm from '../components/BrandForm';
import ProductForm from '../components/ProductForm';
import { FirstInstallationAd } from '../components/FirstInstallationAd';

const STEPS = [{ id: 'welcome', label: 'Welcome' }, { id: 'providers', label: 'Connect AI' },
    { id: 'brand', label: 'Your product' }, { id: 'create', label: 'First ad' }];

export function InstallationSetup() {
    const { state, update } = useInstallation();
    const { brands, addBrand, addProduct } = useBrands();
    const { showError } = useToast();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const [form, setForm] = useState(null);
    const [created, setCreated] = useState(false);
    const container = useRef(null);
    const step = state?.step || 'welcome';
    const complete = created || state?.status === 'complete';
    useEffect(() => {
        container.current?.closest('.studio-main')?.scrollTo({ top: 0 });
    }, [step]);
    const index = STEPS.findIndex(item => item.id === step);
    const productCount = brands.reduce((sum, brand) => sum + (brand.products?.length || 0), 0);
    const move = async (next, status = 'in_progress', destination = null) => {
        if (pending) return;
        setPending(true);
        try { await update(next, status); if (destination) navigate(destination); }
        catch (error) { showError(error.message); }
        finally { setPending(false); }
    };
    if (!state?.can_manage) return <Navigate to="/" replace />;
    return <div ref={container} className="max-w-4xl mx-auto space-y-6 pb-10">
        <header className="studio-page-header">
            <div><p className="studio-eyebrow">Your first creative</p><h1 className="studio-heading">Let’s set up your workspace</h1>
                <p className="studio-description">Connect your tools, add a product, and make an ad you can download.</p></div>
            <button className="studio-button" disabled={pending} onClick={() => move(step, complete ? 'complete' : 'deferred', '/')}>{complete ? 'Back to workspace' : 'Finish later'}</button>
        </header>
        <nav aria-label="Setup progress" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STEPS.map((item, position) => <button key={item.id} className={`flex items-center gap-2 rounded-lg border p-3 text-sm text-left ${step === item.id ? 'border-brand-line bg-brand-soft text-brand-ink' : 'border-line bg-panel text-secondary'}`}
                aria-current={step === item.id ? 'step' : undefined} disabled={pending || position > index}
                onClick={() => move(item.id)}><span className="rounded-full bg-inset w-6 h-6 flex shrink-0 items-center justify-center">{position < index ? <Check size={14} /> : position + 1}</span>{item.label}</button>)}
        </nav>
        {step === 'welcome' && <section className="studio-panel p-6 sm:p-8 space-y-6">
            <Sparkles size={30} className="text-brand-ink" />
            <div><h2 className="text-2xl font-semibold mb-3">Your application is installed.</h2>
                <p className="text-secondary max-w-2xl">Next, connect the services that write your ad copy and create your images. You own these accounts and their usage charges. You can change every connection later in Settings → Integrations.</p></div>
            <div className="grid sm:grid-cols-3 gap-5 text-sm">
                <div><strong className="block mb-1">1. Connect AI</strong><p className="text-secondary">Gemini for words. fal.ai for images. Keep your keys ready.</p></div>
                <div><strong className="block mb-1">2. Add your product</strong><p className="text-secondary">A name, description, and optional photo give your ad a starting point.</p></div>
                <div><strong className="block mb-1">3. Make one ad</strong><p className="text-secondary">Generate, save, and download. Connect advertising accounts when you need them.</p></div>
            </div>
        </section>}
        {step === 'providers' && <ProviderConnections includeOptional={false} />}
        {step === 'brand' && <section className="studio-panel p-6 space-y-5">
            <div><h2 className="text-xl font-semibold">What are you advertising?</h2><p className="text-secondary mt-2">Add your brand, then the product or service you want to promote. A product photo is optional.</p></div>
            <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-line p-5"><Package className="text-brand-ink mb-3" size={22} /><h3 className="font-semibold">Your brand</h3><p className="text-secondary text-sm my-2">{brands.length ? `${brands.length} brand${brands.length === 1 ? '' : 's'} available` : 'Name, voice, and colors'}</p>
                    <button className="studio-button" onClick={() => setForm('brand')}><Plus size={16} />Add a brand</button></div>
                <div className="rounded-lg border border-line p-5"><ImagePlus className="text-brand-ink mb-3" size={22} /><h3 className="font-semibold">Your product</h3><p className="text-secondary text-sm my-2">{productCount ? `${productCount} product${productCount === 1 ? '' : 's'} available` : 'A product or service to feature'}</p>
                    <button className="studio-button" disabled={!brands.length} onClick={() => setForm('product')}><Plus size={16} />Add a product</button></div>
            </div>
        </section>}
        {step === 'create' && <FirstInstallationAd onCreated={async () => { setCreated(true); await update('create', 'complete'); }} />}
        <footer className="flex flex-wrap items-center justify-between gap-3">
            <button className="studio-button" disabled={pending || index === 0} onClick={() => move(STEPS[index - 1].id)}><ArrowLeft size={16} />Back</button>
            {index < STEPS.length - 1 ? <div className="flex flex-wrap gap-3">
                {step !== 'welcome' && <button className="studio-button" disabled={pending} onClick={() => move(STEPS[index + 1].id)}>Skip for now</button>}
                <button className="studio-button bg-brand text-white" disabled={pending || (step === 'brand' && !productCount)} onClick={() => move(STEPS[index + 1].id)}>{step === 'welcome' ? 'Start setup' : 'Continue'}<ArrowRight size={16} /></button>
            </div> : <button className="studio-button bg-brand text-white" disabled={pending} onClick={() => move('create', complete ? 'complete' : 'deferred', complete ? '/generated-ads' : '/')}>{complete ? 'Finish setup and open gallery' : 'Go to my workspace'}<ArrowRight size={16} /></button>}
        </footer>
        <p className="text-sm text-secondary">Your progress is saved. <Link className="text-brand-ink underline" to="/settings?tab=integrations">Manage connections in Settings</Link></p>
        {form === 'brand' && <BrandForm onClose={() => setForm(null)} onSave={async data => { await addBrand(data); setForm(null); }} />}
        {form === 'product' && <ProductForm onClose={() => setForm(null)} onSave={data => addProduct(data.brandId, data)} />}
    </div>;
}
