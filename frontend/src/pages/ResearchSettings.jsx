import { useToast } from '../context/ToastContext';
import React, { useState, useEffect } from 'react';
import { getBlacklist, addToBlacklist, removeFromBlacklist, getKeywordBlacklist, addToKeywordBlacklist, removeFromKeywordBlacklist } from '../api/research';

const ResearchSettings = () => {
    const { showSuccess, showError } = useToast();
    const [blacklist, setBlacklist] = useState([]);
    const [keywordBlacklist, setKeywordBlacklist] = useState([]);
    const [showBlacklistModal, setShowBlacklistModal] = useState(false);
    const [blacklistPageName, setBlacklistPageName] = useState('');
    const [showKeywordModal, setShowKeywordModal] = useState(false);
    const [blacklistKeyword, setBlacklistKeyword] = useState('');

    useEffect(() => {
        fetchBlacklist();
        fetchKeywordBlacklist();
    }, []);

    const fetchBlacklist = async () => {
        try {
            const data = await getBlacklist();
            setBlacklist(data);
        } catch (error) {
            console.error('Failed to load blacklist', error);
        }
    };

    const fetchKeywordBlacklist = async () => {
        try {
            const data = await getKeywordBlacklist();
            setKeywordBlacklist(data);
        } catch (error) {
            console.error('Failed to load keyword blacklist', error);
        }
    };

    const handleAddToBlacklist = async (pageName) => {
        if (!pageName) {
            setShowBlacklistModal(true);
            return;
        }

        try {
            await addToBlacklist(pageName);
            showSuccess(`Added "${pageName}" to blacklist`);
            fetchBlacklist();
            setBlacklistPageName('');
            setShowBlacklistModal(false);
        } catch (error) {
            showError('Failed to add to blacklist');
        }
    };

    const handleRemoveFromBlacklist = async (id, pageName) => {
        try {
            await removeFromBlacklist(id);
            showSuccess(`Removed "${pageName}" from blacklist`);
            fetchBlacklist();
        } catch (error) {
            showError('Failed to remove from blacklist');
        }
    };

    const handleAddToKeywordBlacklist = async (keyword) => {
        if (!keyword) {
            setShowKeywordModal(true);
            return;
        }

        try {
            await addToKeywordBlacklist(keyword);
            showSuccess(`Added "${keyword}" to keyword blacklist`);
            fetchKeywordBlacklist();
            setBlacklistKeyword('');
            setShowKeywordModal(false);
        } catch (error) {
            showError('Failed to add to keyword blacklist');
        }
    };

    const handleRemoveFromKeywordBlacklist = async (id, keyword) => {
        try {
            await removeFromKeywordBlacklist(id);
            showSuccess(`Removed "${keyword}" from keyword blacklist`);
            fetchKeywordBlacklist();
        } catch (error) {
            showError('Failed to remove from keyword blacklist');
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6">Research Settings</h1>

            {/* Page Blacklist Section */}
            <div className="bg-panel rounded-lg shadow-sm border border-line p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Page Blacklist</h2>
                    <button
                        onClick={() => setShowBlacklistModal(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Add Page
                    </button>
                </div>
                <p className="text-secondary mb-4">
                    Pages added here will be automatically filtered out from all future searches.
                </p>

                {blacklist.length === 0 ? (
                    <p className="text-muted text-center py-8">No blacklisted pages</p>
                ) : (
                    <div className="space-y-2">
                        {blacklist.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 bg-subtle rounded border border-line">
                                <div>
                                    <p className="font-medium">{item.page_name}</p>
                                    {item.reason && <p className="text-sm text-secondary">{item.reason}</p>}
                                </div>
                                <button
                                    onClick={() => handleRemoveFromBlacklist(item.id, item.page_name)}
                                    className="px-3 py-1 bg-danger-soft text-danger rounded hover:bg-danger-soft text-sm"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Keyword Blacklist Section */}
            <div className="bg-panel rounded-lg shadow-sm border border-line p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Keyword Blacklist</h2>
                    <button
                        onClick={() => setShowKeywordModal(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Add Keyword
                    </button>
                </div>
                <p className="text-secondary mb-4">
                    Keywords added here will filter out ads containing these words in the title, body, or caption.
                </p>

                {keywordBlacklist.length === 0 ? (
                    <p className="text-muted text-center py-8">No blacklisted keywords</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {keywordBlacklist.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-danger-soft border border-danger-line rounded">
                                <span className="font-medium">{item.keyword}</span>
                                <button
                                    onClick={() => handleRemoveFromKeywordBlacklist(item.id, item.keyword)}
                                    className="text-danger hover:text-danger"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Page Blacklist Modal */}
            {showBlacklistModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-panel rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">Add Page to Blacklist</h3>
                        <input
                            type="text"
                            value={blacklistPageName}
                            onChange={(e) => setBlacklistPageName(e.target.value)}
                            placeholder="Page name"
                            className="w-full p-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-red-500 outline-none mb-4"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setShowBlacklistModal(false);
                                    setBlacklistPageName('');
                                }}
                                className="flex-1 px-4 py-2 border border-line-strong text-secondary rounded hover:bg-subtle"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleAddToBlacklist(blacklistPageName)}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Keyword Blacklist Modal */}
            {showKeywordModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-panel rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">Add Keyword to Blacklist</h3>
                        <input
                            type="text"
                            value={blacklistKeyword}
                            onChange={(e) => setBlacklistKeyword(e.target.value)}
                            placeholder="Keyword"
                            className="w-full p-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-red-500 outline-none mb-4"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setShowKeywordModal(false);
                                    setBlacklistKeyword('');
                                }}
                                className="flex-1 px-4 py-2 border border-line-strong text-secondary rounded hover:bg-subtle"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleAddToKeywordBlacklist(blacklistKeyword)}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResearchSettings;
