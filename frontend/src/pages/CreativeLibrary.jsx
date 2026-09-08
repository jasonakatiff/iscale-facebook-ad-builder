import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreativePicker } from '../components/CreativePicker';

export function CreativeLibrary() {
    const [selected, setSelected] = useState([]);
    return <div className="max-w-6xl mx-auto space-y-6"><header><h1 className="text-3xl font-bold text-primary">Creative Library</h1><p className="text-secondary mt-2">Reusable creative, source history and metadata attributed to your team. Select an asset to inspect its metadata.</p><Link to="/facebook-campaigns" className="text-brand-ink underline text-sm">Build a campaign</Link></header><div className="bg-surface border border-line rounded-xl p-6"><CreativePicker selected={selected} onChange={setSelected} /></div></div>;
}
