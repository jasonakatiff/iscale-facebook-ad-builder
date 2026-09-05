import React from 'react';

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
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] render crash:', error, info?.componentStack);
    }

    handleRetry = () => {
        this.setState({ error: null });
    };

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-[50vh] flex items-center justify-center p-6">
                    <div role="alert" className="bg-white border border-amber-200 rounded-xl shadow-sm p-6 max-w-md w-full">
                        <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
                        <p className="mt-2 text-sm text-gray-600">
                            The page failed to render. Your data is safe — try again.
                        </p>
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
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
