import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { useBrands } from '../context/BrandContext';
import { useInstallation } from '../context/InstallationContext';
import { usePlatformApi, downloadBlob } from '../lib/platformApi';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { SearchableSelect } from './SearchableSelect';

export function FirstInstallationAd({ onCreated }) {
    const { brands } = useBrands();
    const { state, update } = useInstallation();
    const api = usePlatformApi();
    const [brandId, setBrandId] = useState('');
    const [productId, setProductId] = useState('');
    const [audience, setAudience] = useState('');
    const [message, setMessage] = useState('');
    const [pending, setPending] = useState('');
    const [error, setError] = useState('');
    const [asset, setAsset] = useState(null);
    const [record, setRecord] = useState(null);
    const [saved, setSaved] = useState(false);
    const [recovery, setRecovery] = useState(null);
    const brand = brands.find(item => item.id === brandId) || brands[0];
    const products = brand?.products || [];
    const product = products.find(item => item.id === productId) || products[0];
    const ready = state?.capabilities.image_ad_workflow && product;
    const save = async (ad) => {
        await api('/generated-ads/batch', { method: 'POST', body: JSON.stringify({ ads: [ad] }) });
        setSaved(true);
        await onCreated();
    };
    const generate = async (event) => {
        event.preventDefault();
        if (pending || !ready || asset) return;
        setError('');
        setRecovery(null);
        setPending('Writing your ad copy…');
        try {
            const copyResult = await api('/copy-generation/generate', {
                method: 'POST', body: JSON.stringify({ brand, product, profile: { demographics: audience },
                    campaignDetails: { offer: message, messaging: message }, variationCount: 1 }),
            });
            const copy = copyResult.variations?.[0];
            if (!copy?.headline) throw new Error('The copy provider returned an incomplete ad. No image was generated.');
            setPending('Creating one image. This can take a minute…');
            const shots = (product.product_shots || []).map(resolveMediaUrl);
            const result = await api('/generated-ads/generate-image', {
                method: 'POST', body: JSON.stringify({ brand, product, copy,
                    template: { type: 'style', design_style: 'Clean product photography' },
                    count: 1, imageSizes: [{ name: 'Square', width: 1080, height: 1080 }],
                    productShots: shots, useProductImage: shots.length > 0 }),
            });
            const image = result.images?.[0];
            if (!image?.url || !image.id) throw new Error('The image service did not return a saved creative. Check its request history before retrying.');
            const nextAsset = { ...image, url: resolveMediaUrl(image.url), ...copy };
            const ad = { id: image.id, adBundleId: image.adBundleId, brandId: brand.id,
                productId: product.id, templateId: null, imageUrl: nextAsset.url, headline: copy.headline,
                body: copy.body || '', cta: copy.cta || '', sizeName: image.size,
                dimensions: image.dimensions, prompt: image.prompt };
            setAsset(nextAsset);
            setRecord(ad);
            setPending('Saving your ad…');
            await save(ad);
        } catch (err) {
            setError(err.message);
            const url = err.details?.recovery_url;
            if (typeof url === 'string' && /^https:\/\//.test(url)) setRecovery(url);
        } finally { setPending(''); }
    };
    const changeStep = async (step) => {
        try { await update(step); } catch (err) { setError(err.message); }
    };
    const download = async () => {
        setPending('Preparing download…');
        try {
            const response = await fetch(asset.url);
            if (!response.ok) throw new Error('The image could not be downloaded. Your saved ad remains in the gallery.');
            downloadBlob(await response.blob(), 'my-first-ad.png');
        } catch (err) { setError(err.message); }
        finally { setPending(''); }
    };
    return <section className="studio-panel p-6 space-y-5">
        <div><h2 className="text-xl font-semibold">Create your first image ad</h2><p className="text-secondary mt-2">One product. One message. One image you can save and download.</p></div>
        {!state?.capabilities.image_ad_workflow && <div className="rounded-lg bg-inset p-4 text-sm">
            <p className="mb-3">Connect Gemini for copy and fal.ai for images before generating.</p>
            <button className="studio-button" onClick={() => changeStep('providers')}>Connect AI services</button>
        </div>}
        {!product && <div className="rounded-lg bg-inset p-4 text-sm"><p className="mb-3">Add a brand and product to give your ad a starting point.</p><button className="studio-button" onClick={() => changeStep('brand')}>Add your product</button></div>}
        {!asset && <form onSubmit={generate} className="space-y-4">
            <fieldset disabled={!!pending} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                    <SearchableSelect label="Brand" options={brands} value={brand?.id || ''} onChange={id => { setBrandId(id); setProductId(''); }} />
                    <SearchableSelect label="Product" options={products} value={product?.id || ''} onChange={setProductId} />
                </div>
                <label className="block text-sm font-medium">Who is this ad for?
                    <input className="help-input mt-2" required minLength={3} maxLength={500} placeholder="For example, busy parents looking for quick dinners" value={audience} onChange={event => setAudience(event.target.value)} /></label>
                <label className="block text-sm font-medium">What do you want them to know?
                    <textarea className="help-input mt-2" required minLength={3} maxLength={1000} rows={3} placeholder="Describe the benefit or offer you want to promote" value={message} onChange={event => setMessage(event.target.value)} /></label>
            </fieldset>
            <p className="text-sm text-secondary">Generating uses your Gemini and fal.ai accounts and can incur provider charges. This creates one image and does not launch an advertising campaign.</p>
            <button type="submit" className="studio-button bg-brand text-white" disabled={!!pending || !ready}><Sparkles size={17} />Generate one ad</button>
        </form>}
        {pending && <p className="text-secondary flex items-center gap-2" role="status"><Loader2 size={17} className="animate-spin" />{pending}</p>}
        {error && <div role="alert" className="text-danger text-sm space-y-2"><p>{error}</p>
            {recovery && <a href={recovery} className="underline" target="_blank" rel="noopener noreferrer">Download the generated image before its provider link expires</a>}
        </div>}
        {asset && <div className="grid sm:grid-cols-2 gap-6 items-start">
            <img className="w-full rounded-lg border border-line" src={asset.url} alt="Your first generated product ad" />
            <div className="space-y-4"><h3 className="font-semibold text-lg">{asset.headline}</h3><p className="text-secondary whitespace-pre-line">{asset.body}</p>
                <p className="text-sm">{saved ? 'Saved to your creative gallery.' : 'Your image is ready. Save it to your gallery before leaving this page.'}</p>
                <button className="studio-button" disabled={!!pending} onClick={download}><Download size={16} />Download image</button>
                {!saved && <button className="studio-button" disabled={!!pending} onClick={async () => {
                    setPending('Saving your ad…'); setError('');
                    try { await save(record); } catch (err) { setError(err.message); } finally { setPending(''); }
                }}>Save to gallery</button>}
                {saved && <Link className="studio-button" to="/generated-ads">Open creative gallery</Link>}
            </div>
        </div>}
    </section>;
}
