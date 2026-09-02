import React from 'react';
import { BarChart3, ExternalLink, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME, APP_LOGO, APP_OPERATOR, APP_OPERATOR_URL } from '../lib/branding';

const updatedAt = 'July 22, 2026';

const sections = {
    about: {
        eyebrow: 'Paid media operations',
        title: APP_NAME,
        summary: `A private advertising operations platform used by ${APP_OPERATOR} to connect authorized ad accounts, review performance, and manage campaigns with human approval.`,
        content: [
            ['What the platform does', `${APP_NAME} brings Google Ads, Meta Ads, and TikTok Ads reporting into one authenticated workspace. Google Ads users explicitly choose an authorized customer account before any campaign data is loaded.`],
            ['Human-controlled changes', 'Campaign changes are never executed silently. New Google Search campaigns are created paused, and every create, pause, enable, or negative-keyword action requires an explicit operator confirmation after a preview.'],
            ['Who operates it', `The platform is operated by ${APP_OPERATOR}, an Indonesian digital marketing agency. Access is limited to authorized operators who manage advertising accounts on behalf of ${APP_OPERATOR} and its clients.`],
        ],
    },
    privacy: {
        eyebrow: 'Privacy',
        title: 'Privacy Policy',
        summary: `How ${APP_OPERATOR} and ${APP_NAME} collect, use, protect, and delete information connected through advertising providers.`,
        content: [
            ['Information we collect', `We process account identifiers, campaign configuration, and performance metrics that an authorized user permits through Google Ads or another advertising provider. We also process the name and email used to authenticate to ${APP_NAME}. We do not request or store Google account passwords.`],
            ['How information is used', 'Provider data is used only to display advertising performance, prepare reports, and carry out campaign actions explicitly requested and confirmed by an authorized operator. We do not sell Google user data, use it for advertising profiles, or transfer it to data brokers.'],
            ['Google API Services user data', "Our use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Google Ads OAuth credentials are used only to provide the user-facing advertising management features described on this page."],
            ['Security', 'OAuth access and refresh tokens are encrypted at rest. Application passwords and machine API keys are hashed. Production traffic uses HTTPS, provider credentials are not exposed to the browser after OAuth, and reporting bots have read-only access with no campaign write routes.'],
            ['Retention and deletion', `Advertising connection data is retained while the connection is active and needed to provide the service. An operator can disconnect an account in ${APP_NAME}. Users may also revoke access in their Google Account permissions. To request deletion of account data or OAuth credentials, contact the address below; verified requests are processed within 30 days.`],
            ['Sharing and processors', 'We share data only with infrastructure providers needed to operate the service or when required by law. We do not allow those providers to use Google user data for independent advertising purposes.'],
            ['Contact', `Privacy and data deletion requests: didik.w.yudi@gmail.com. Operator: ${APP_OPERATOR}, Banguntapan, Bantul, Indonesia.`],
        ],
    },
    terms: {
        eyebrow: 'Terms',
        title: 'Terms of Service',
        summary: `Rules for authorized use of ${APP_NAME} and its advertising-provider integrations.`,
        content: [
            ['Authorized use', `${APP_NAME} is for authorized ${APP_OPERATOR} operators and approved client advertising accounts. Users must have permission to access every connected account and must comply with Google Ads policies, applicable laws, and client instructions.`],
            ['Operator responsibility', 'Users are responsible for reviewing campaign details, budgets, targeting, and previews before confirmation. Enabling a campaign may cause advertising spend. The platform does not guarantee campaign performance, leads, revenue, or return on ad spend.'],
            ['Prohibited use', 'Users may not bypass access controls, connect accounts without authorization, extract credentials, resell provider data, automate abusive activity, or use the platform to violate advertising-provider policies.'],
            ['Availability and changes', 'The service depends on third-party advertising APIs and may be interrupted by provider outages, account restrictions, policy changes, or access-level reviews. Features may be changed to preserve security, compliance, or provider compatibility.'],
            ['Suspension and termination', 'Access may be suspended when an account is compromised, authorization is withdrawn, policies are violated, or continued operation could harm a client, provider, or the platform.'],
            ['Contact', `Questions about these terms: didik.w.yudi@gmail.com. Operator: ${APP_OPERATOR}, Banguntapan, Bantul, Indonesia.`],
        ],
    },
};

export default function PublicInfoPage({ page }) {
    const data = sections[page];

    return (
        <div className="min-h-screen bg-[#FFFAF0] text-gray-900">
            <header className="border-b border-amber-200 bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
                    <Link to="/about" className="flex items-center gap-3">
                        <img src={APP_LOGO} alt={APP_NAME} className="h-10 w-10" />
                        <div>
                            <div className="font-bold text-amber-950">{APP_NAME}</div>
                            <div className="text-xs text-amber-700">Operated by {APP_OPERATOR}</div>
                        </div>
                    </Link>
                    <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800 hover:text-amber-950">
                        Operator sign in <ExternalLink size={15} />
                    </Link>
                </div>
            </header>

            <main>
                <section className="border-b border-amber-200 bg-amber-50">
                    <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
                        <div className="mb-5 flex h-12 w-12 items-center justify-center bg-amber-700 text-white">
                            {page === 'privacy' ? <LockKeyhole size={24} /> : <BarChart3 size={24} />}
                        </div>
                        <p className="mb-2 text-sm font-bold uppercase text-amber-700">{data.eyebrow}</p>
                        <h1 className="max-w-3xl text-4xl font-bold text-amber-950 sm:text-5xl">{data.title}</h1>
                        <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-700">{data.summary}</p>
                        {page !== 'about' && <p className="mt-4 text-sm text-gray-500">Effective and last updated: {updatedAt}</p>}
                    </div>
                </section>

                <section className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 px-5 py-12 md:grid-cols-2">
                    {data.content.map(([heading, body]) => (
                        <article key={heading}>
                            <h2 className="text-lg font-bold text-amber-950">{heading}</h2>
                            <p className="mt-3 leading-7 text-gray-700">{body}</p>
                        </article>
                    ))}
                </section>
            </main>

            <footer className="border-t border-amber-200 bg-white">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 text-sm text-gray-600">
                    <span>© 2026 {APP_OPERATOR}</span>
                    <Link to="/about" className="hover:text-amber-800">About</Link>
                    <Link to="/privacy" className="hover:text-amber-800">Privacy</Link>
                    <Link to="/terms" className="hover:text-amber-800">Terms</Link>
                    <a href={APP_OPERATOR_URL} target="_blank" rel="noreferrer" className="hover:text-amber-800">{APP_OPERATOR}</a>
                </div>
            </footer>
        </div>
    );
}