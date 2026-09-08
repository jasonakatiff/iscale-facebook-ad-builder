import React from 'react';
import { reportBrowserEvent } from '../lib/telemetry';

/**
 * Global render-crash boundary (Sprint 8). Before this, a throw inside any
 * page component unmounted the whole React tree -> blank white screen with
 * no recovery. This boundary renders a small retry card instead and logs the
 * error to the browser console for triage. Data-fetch errors do NOT land here
 * (pages handle those via useToast) — only render-time exceptions do.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, reference: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] render crash:', error, info?.componentStack);
        this.setState({ reference: reportBrowserEvent('browser.render_error', { level: 'error', message: error.message }) });
    }

    handleRetry = () => {
        this.setState({ error: null, reference: null });
    };

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-[50vh] flex items-center justify-center p-6">
                    <div role="alert" className="bg-panel border border-brand-line rounded-xl shadow-sm p-6 max-w-md w-full">
                        <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
                        <p className="mt-2 text-sm text-secondary">
                            The page failed to render. Your data is safe — try again.
                        </p>
                        {this.state.reference && <p className="mt-3 text-xs font-mono break-all">Reference: {this.state.reference}</p>}
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
