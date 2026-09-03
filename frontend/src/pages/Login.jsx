import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { APP_NAME, APP_LOGO, APP_TAGLINE } from '../lib/branding';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const { login } = useAuth();
    const { showSuccess, showError } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await login(email, password);
            showSuccess('Welcome back!');
            navigate(from, { replace: true });
        } catch (err) {
            showError(err.message || 'Failed to login');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FFFAF0] flex items-center justify-center px-4 py-10">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 sm:p-8">
                    {/* Brand header — shows the deployment's real identity so the
                        user can trust the page before typing a password. */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-2xl border border-amber-200 mb-4 overflow-hidden">
                            <img src={APP_LOGO} alt={APP_NAME} className="w-full h-full object-cover" />
                        </div>
                        <h1 className="text-2xl font-bold text-amber-950">{APP_NAME}</h1>
                        <p className="text-sm text-amber-600 mt-1">{APP_TAGLINE}</p>
                    </div>

                    <h2 className="text-lg font-semibold text-gray-900 mb-1">Welcome back</h2>
                    <p className="text-sm text-gray-500 mb-6">Sign in to your account</p>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email Field */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    placeholder="Enter your password"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-amber-700"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5" />
                                    ) : (
                                        <Eye className="h-5 w-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <LogIn className="h-5 w-5" />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>

                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    <Link to="/about" className="hover:text-amber-700">About</Link>
                    <span className="mx-2">·</span>
                    <Link to="/privacy" className="hover:text-amber-700">Privacy</Link>
                    <span className="mx-2">·</span>
                    <Link to="/terms" className="hover:text-amber-700">Terms</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
