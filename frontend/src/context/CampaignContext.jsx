import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useAuth } from './AuthContext';
import { defaultWizardState, normalizeObjective } from '../lib/campaignWizard';
import { tomorrowInTimezone } from '../lib/accountTime';
import { clearCampaignDraft, loadCampaignDraft, saveCampaignDraft } from '../lib/campaignDraft';

const CampaignContext = createContext();
// The shared context hook accompanies this provider, as in the other app contexts.
// eslint-disable-next-line react-refresh/only-export-components
export const useCampaign = () => {
    const context = useContext(CampaignContext);
    if (!context) throw new Error('useCampaign must be used within CampaignProvider');
    return context;
};

export const CampaignProvider = ({ children, persist = false, draftScope = 'system' }) => {
    const { user } = useAuth();
    const [state, setState] = useState(defaultWizardState);
    const [ready, setReady] = useState(!persist);
    const [draftStatus, setDraftStatus] = useState('');
    const [draftError, setDraftError] = useState('');
    const key = persist && user?.id ? `breadwinner:campaign-draft:v1:${user.id}:${draftScope}` : null;
    const saveQueue = useRef(Promise.resolve());
    const latest = useRef(state);
    useEffect(() => {
        latest.current = state;
    }, [state]);

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        loadCampaignDraft(key)
            .then((draft) => {
                if (!cancelled && draft) {
                    setState({ ...defaultWizardState(), ...draft });
                    setDraftStatus('Draft restored');
                }
            })
            .catch((error) => {
                if (!cancelled) setDraftError(`Draft could not be restored: ${error.message}`);
            })
            .finally(() => {
                if (!cancelled) setReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [key]);

    useEffect(() => {
        if (!key || !ready) return;
        let cancelled = false;
        saveQueue.current = saveQueue.current
            .catch((error) => {
                setDraftError(error.message);
            })
            .then(() => {
                if (!cancelled) setDraftStatus('Saving draft…');
                return saveCampaignDraft(key, state);
            });
        saveQueue.current
            .then(() => {
                if (!cancelled) {
                    setDraftStatus('Draft saved on this browser');
                    setDraftError('');
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setDraftStatus('');
                    setDraftError(`Draft could not be saved: ${error.message}`);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [key, ready, state]);

    const setField = useCallback(
        (field, update) =>
            setState((previous) => {
                const value = typeof update === 'function' ? update(previous[field]) : update;
                const next = { ...previous, [field]: value };
                if (field === 'campaignData') {
                    if (previous.campaignData.fbCampaignId !== value.fbCampaignId)
                        next.adsetData = {
                            ...previous.adsetData,
                            id: null,
                            fbAdsetId: null,
                            isExisting: false,
                        };
                    if (
                        previous.campaignData.objective !== value.objective &&
                        !next.adsetData.isExisting
                    )
                        next.adsetData = normalizeObjective(value.objective, next.adsetData);
                }
                return next;
            }),
        [],
    );
    const setters = useMemo(
        () =>
            Object.fromEntries(
                [
                    'campaignData',
                    'adsetData',
                    'creativeData',
                    'adsData',
                    'currentStep',
                    'publishProgress',
                    'leadRouter',
                ].map((field) => [
                    `set${field[0].toUpperCase()}${field.slice(1)}`,
                    (update) => setField(field, update),
                ]),
            ),
        [setField],
    );

    const setSelectedAdAccount = useCallback(
        (account) =>
            setState((previous) => {
                if (previous.selectedAdAccount?.id === account?.id)
                    return { ...previous, selectedAdAccount: account };
                const defaults = defaultWizardState();
                let startTime = '';
                if (account?.timezone) startTime = tomorrowInTimezone(account.timezone);
                return {
                    ...previous,
                    selectedAdAccount: account,
                    campaignData: defaults.campaignData,
                    adsetData: { ...defaults.adsetData, startTime },
                    creativeData: {
                        ...previous.creativeData,
                        pageId: '',
                        instagramId: null,
                        urlParameters: defaults.creativeData.urlParameters,
                    },
                    adsData: [],
                    publishProgress: null,
                };
            }),
        [],
    );

    const resetWizard = useCallback(async () => {
        try {
            await saveQueue.current;
            if (key) await clearCampaignDraft(key);
            for (const creative of latest.current.creativeData.creatives)
                if (creative.previewUrl?.startsWith('blob:'))
                    URL.revokeObjectURL(creative.previewUrl);
            setState(defaultWizardState());
            setDraftError('');
        } catch (error) {
            setDraftError(`Could not discard draft: ${error.message}`);
        }
    }, [key]);

    const savePublishProgress = useCallback(
        async (publishProgress) => {
            const snapshot = { ...latest.current, publishProgress };
            latest.current = snapshot;
            setState(snapshot);
            if (!key) return;
            saveQueue.current = saveQueue.current
                .catch((error) => {
                    setDraftError(error.message);
                })
                .then(() => saveCampaignDraft(key, snapshot));
            await saveQueue.current;
        },
        [key],
    );

    return (
        <CampaignContext.Provider
            value={{
                ...state,
                ...setters,
                state,
                setState,
                setSelectedAdAccount,
                resetWizard,
                savePublishProgress,
                ready: !key || ready,
                draftStatus,
                draftError,
            }}
        >
            {children}
        </CampaignContext.Provider>
    );
};
