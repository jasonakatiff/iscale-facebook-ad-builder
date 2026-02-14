import React, { useState, useEffect, useRef } from 'react';
import { X, Video, Loader2, Check, AlertCircle, Download, ChevronDown } from 'lucide-react';
import { getMotions, generateVideo, getJobStatus } from '../api/higgsfield';
import { useToast } from '../context/ToastContext';

// Ad-friendly motion categories
const MOTION_CATEGORIES = {
    'Zoom': ['zoom', 'crash zoom'],
    'Dolly': ['dolly'],
    'Pan': ['pan'],
    'Orbit': ['orbit'],
    'Tilt': ['tilt'],
    'Push': ['push'],
    'Pull': ['pull'],
    'Other': [],
};

function categorizeMotions(motions) {
    const categorized = {};
    const used = new Set();

    for (const [category, keywords] of Object.entries(MOTION_CATEGORIES)) {
        if (category === 'Other') continue;
        categorized[category] = motions.filter(m => {
            const name = m.name?.toLowerCase() || '';
            const match = keywords.some(k => name.includes(k));
            if (match) used.add(m.id);
            return match;
        });
    }

    categorized['Other'] = motions.filter(m => !used.has(m.id));
    // Remove empty categories
    return Object.fromEntries(Object.entries(categorized).filter(([, v]) => v.length > 0));
}

export default function GenerateVideoModal({ imageUrl, onClose, onVideoReady }) {
    const { showSuccess, showError } = useToast();
    const [motions, setMotions] = useState(null);
    const [categorizedMotions, setCategorizedMotions] = useState(null);
    const [selectedMotion, setSelectedMotion] = useState(null);
    const [expandedCategory, setExpandedCategory] = useState('Zoom');
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState('dop-lite');
    const [strength, setStrength] = useState(0.5);
    const [loading, setLoading] = useState(false);
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);

    // Load motions on mount
    useEffect(() => {
        (async () => {
            try {
                const data = await getMotions();
                setMotions(data);
                setCategorizedMotions(categorizeMotions(data));
                // Pre-select "Dolly In" or first motion
                const dollyIn = data.find(m => m.name === 'Dolly In');
                setSelectedMotion(dollyIn || data[0]);
            } catch (err) {
                setError('Failed to load motion presets');
            }
        })();
    }, []);

    // Poll job status
    useEffect(() => {
        if (!jobId) return;

        const poll = async () => {
            try {
                const data = await getJobStatus(jobId);
                const status = data.status?.toLowerCase?.() || data.status;
                setJobStatus(status);

                if (status === 'completed') {
                    // Extract video URL from result
                    const videoUrl = data.result?.video_url
                        || data.result?.url
                        || data.jobs?.[0]?.result?.video_url
                        || data.jobs?.[0]?.result?.url
                        || null;
                    setResult({ ...data, videoUrl });
                    setLoading(false);
                    if (videoUrl) {
                        showSuccess('Video generated successfully!');
                    }
                    clearInterval(pollRef.current);
                } else if (status === 'failed') {
                    setError(data.error || 'Video generation failed');
                    setLoading(false);
                    clearInterval(pollRef.current);
                } else if (status === 'nsfw') {
                    setError('Image was flagged as NSFW');
                    setLoading(false);
                    clearInterval(pollRef.current);
                }
            } catch {
                // Keep polling on transient errors
            }
        };

        pollRef.current = setInterval(poll, 5000);
        poll(); // Initial check

        return () => clearInterval(pollRef.current);
    }, [jobId]);

    const handleGenerate = async () => {
        if (!selectedMotion) {
            showError('Please select a motion preset');
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        setJobStatus('submitting');

        try {
            const data = await generateVideo({
                image_url: imageUrl,
                motion_id: selectedMotion.id,
                prompt,
                model,
                strength,
            });
            const id = data.id || data.job_set_id;
            setJobId(id);
            setJobStatus('queued');
        } catch (err) {
            const detail = err.response?.data?.detail || err.message;
            setError(detail);
            setLoading(false);
        }
    };

    const handleSaveToLibrary = () => {
        if (result?.videoUrl && onVideoReady) {
            onVideoReady(result.videoUrl);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Video size={20} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Generate Video</h2>
                            <p className="text-xs text-gray-500">Powered by Higgsfield AI</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* Source image preview */}
                    <div className="flex gap-4">
                        <img
                            src={imageUrl}
                            alt="Source"
                            className="w-32 h-24 object-cover rounded-lg border border-gray-200"
                        />
                        <div className="flex-1 text-sm text-gray-500">
                            <p>This image will be animated into a short video using the motion preset you select below.</p>
                        </div>
                    </div>

                    {/* Motion presets */}
                    {!motions ? (
                        <div className="flex items-center justify-center py-8 text-gray-400">
                            <Loader2 size={20} className="animate-spin mr-2" />
                            Loading motion presets...
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Motion Preset
                            </label>
                            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                                {categorizedMotions && Object.entries(categorizedMotions).map(([category, items]) => (
                                    <div key={category}>
                                        <button
                                            onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                        >
                                            {category} ({items.length})
                                            <ChevronDown size={14} className={`transition-transform ${expandedCategory === category ? 'rotate-180' : ''}`} />
                                        </button>
                                        {expandedCategory === category && (
                                            <div className="grid grid-cols-2 gap-1 p-2">
                                                {items.map(m => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => setSelectedMotion(m)}
                                                        className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                                            selectedMotion?.id === m.id
                                                                ? 'bg-purple-100 text-purple-700 font-medium'
                                                                : 'hover:bg-gray-50 text-gray-600'
                                                        }`}
                                                    >
                                                        {m.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {selectedMotion && (
                                <p className="mt-1 text-xs text-purple-600">
                                    Selected: {selectedMotion.name}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Prompt */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Prompt <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Describe the scene or leave blank for auto"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                    </div>

                    {/* Model + Strength */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quality</label>
                            <select
                                value={model}
                                onChange={e => setModel(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            >
                                <option value="dop-lite">Lite (fastest, cheapest)</option>
                                <option value="dop-turbo">Turbo (balanced)</option>
                                <option value="dop-preview">Preview (highest quality)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Motion Strength: {Math.round(strength * 100)}%
                            </label>
                            <input
                                type="range"
                                min="0.1"
                                max="1.0"
                                step="0.1"
                                value={strength}
                                onChange={e => setStrength(parseFloat(e.target.value))}
                                className="w-full mt-1"
                            />
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Job status */}
                    {loading && jobStatus && (
                        <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                            <Loader2 size={20} className="animate-spin text-purple-600" />
                            <div>
                                <p className="text-sm font-medium text-purple-700">
                                    {jobStatus === 'submitting' && 'Submitting job...'}
                                    {jobStatus === 'queued' && 'Queued — waiting for GPU...'}
                                    {jobStatus === 'in_progress' && 'Generating video...'}
                                    {!['submitting', 'queued', 'in_progress'].includes(jobStatus) && `Status: ${jobStatus}`}
                                </p>
                                <p className="text-xs text-purple-500 mt-0.5">This usually takes 30-90 seconds</p>
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result?.videoUrl && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-green-700">
                                <Check size={18} />
                                <span className="text-sm font-medium">Video generated!</span>
                            </div>
                            <video
                                src={result.videoUrl}
                                controls
                                autoPlay
                                loop
                                className="w-full rounded-lg border border-gray-200"
                            />
                            <div className="flex gap-2">
                                <a
                                    href={result.videoUrl}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                                >
                                    <Download size={16} />
                                    Download
                                </a>
                                {onVideoReady && (
                                    <button
                                        onClick={handleSaveToLibrary}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm transition-colors"
                                    >
                                        <Check size={16} />
                                        Save to Ads Library
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {result && !result.videoUrl && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                            Job completed but no video URL found. Check the Higgsfield dashboard.
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!result && (
                    <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={loading || !selectedMotion}
                            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg text-sm transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Video size={16} />
                                    Generate Video
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
