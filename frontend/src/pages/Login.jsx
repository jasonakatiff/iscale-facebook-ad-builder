import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { BrandMark } from '../components/BrandMark';
import { PoweredBy } from '../components/PoweredBy';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const { showSuccess, showError } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';
    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        try {
            await login(email, password);
            showSuccess('Welcome back!');
            navigate(from, { replace: true });
        } catch (error) {
            showError(error.message || 'Failed to login');
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <div className="login-page">
            <aside className="login-story">
                <BrandMark />
                <div className="login-statement">
                    <p className="studio-eyebrow">
                        Ideas into creative. Creative into campaigns.
                    </p>
                    <h2>
                        Your next campaign,
                        <br />
                        <span>from one workspace.</span>
                    </h2>
                    <p className="studio-description max-w-sm mt-6">
                        Explore what’s working, create your next ad, and bring
                        every detail together before you launch.
                    </p>
                    <div className="login-steps">
                        <span>
                            <b className="workflow-index">01</b>Research
                        </span>
                        <span>
                            <b className="workflow-index">02</b>Create
                        </span>
                        <span>
                            <b className="workflow-index">03</b>Launch
                        </span>
                    </div>
                </div>
                <PoweredBy className="login-footer" />
            </aside>
            <div className="login-form-area">
                <div className="flex items-center justify-between gap-4">
                    <span className="md:hidden">
                        <BrandMark compact />
                    </span>
                    <span className="hidden md:block" />
                    <ThemeSwitch />
                </div>
                <div className="login-form-card">
                    <p className="studio-eyebrow">Back to the workspace</p>
                    <h1>Welcome Back</h1>
                    <p className="studio-description mb-8">
                        Sign in to pick up where you left off.
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="login-field">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                className="login-input"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                placeholder="you@company.com"
                                autoComplete="email"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="login-field">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="login-input pr-12"
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="icon-button absolute right-1 top-1"
                                    aria-label={
                                        showPassword
                                            ? 'Hide password'
                                            : 'Show password'
                                    }
                                    onClick={() =>
                                        setShowPassword((value) => !value)
                                    }
                                >
                                    {showPassword ? (
                                        <EyeOff size={17} />
                                    ) : (
                                        <Eye size={17} />
                                    )}
                                </button>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="studio-button primary w-full !min-h-11 !mt-7"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2
                                        size={16}
                                        className="animate-spin"
                                    />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
                <PoweredBy className="text-center" />
            </div>
        </div>
    );
}
