import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PrivateRoute = ({ children, requiredRole, requiredPermission }) => {
    const { isAuthenticated, loading, hasRole, hasPermission } = useAuth();
    const location = useLocation();

    // Show loading state while checking auth
    if (loading) {
        return (
            <div className="min-h-screen bg-canvas flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <svg className="animate-spin h-10 w-10 text-info" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-faint">Loading...</p>
                </div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check for required role
    if (requiredRole && !hasRole(requiredRole)) {
        return (
            <div className="min-h-screen bg-canvas flex items-center justify-center">
                <div className="bg-panel rounded-lg p-8 max-w-md text-center">
                    <div className="text-danger text-5xl mb-4">403</div>
                    <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
                    <p className="text-faint mb-4">
                        You don't have the required role to access this page.
                    </p>
                    <button
                        onClick={() => window.history.back()}
                        className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    // Check for required permission
    if (requiredPermission && !hasPermission(requiredPermission)) {
        return (
            <div className="min-h-screen bg-canvas flex items-center justify-center">
                <div className="bg-panel rounded-lg p-8 max-w-md text-center">
                    <div className="text-danger text-5xl mb-4">403</div>
                    <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
                    <p className="text-faint mb-4">
                        You don't have the required permission to access this page.
                    </p>
                    <button
                        onClick={() => window.history.back()}
                        className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return children;
};

export default PrivateRoute;
