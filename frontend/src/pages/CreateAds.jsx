import { Link } from 'react-router-dom';
import { Image, Play, ArrowRight, Layers2 } from 'lucide-react';

export default function CreateAds() {
    return (
        <div className="max-w-5xl mx-auto">
            <div className="studio-page-header">
                <div>
                    <p className="studio-eyebrow">Creative studio</p>
                    <h1 className="studio-heading">Build Creatives</h1>
                    <p className="studio-description">
                        Choose a format. Bring your brand and your next idea.
                    </p>
                </div>
            </div>
            <div className="format-grid">
                <Link to="/image-ads" className="format-card" aria-label="Create an image ad">
                    <div className="format-art" aria-hidden="true">
                        <div className="format-frame back" />
                        <div className="format-frame">
                            <div className="format-image">
                                <Image size={28} strokeWidth={1.3} />
                            </div>
                            <div className="format-line" />
                            <div className="format-line short" />
                        </div>
                    </div>
                    <div className="format-copy">
                        <p className="studio-eyebrow !min-h-0 !mt-0 !mb-3">01 / Static creative</p>
                        <h2>Image ads</h2>
                        <p>
                            Build from a winning template or generate new visuals for feeds and
                            stories.
                        </p>
                        <span className="format-link">
                            Create an image ad
                            <ArrowRight size={17} />
                        </span>
                    </div>
                </Link>
                <Link to="/video-ads" className="format-card" aria-label="Create a video ad">
                    <div className="format-art" aria-hidden="true">
                        <div className="format-video">
                            <Play size={30} strokeWidth={1.3} />
                            <div className="format-timeline">
                                {Array.from({ length: 5 }, (_, index) => (
                                    <span key={index} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="format-copy">
                        <p className="studio-eyebrow !min-h-0 !mt-0 !mb-3">02 / Motion creative</p>
                        <h2>Video ads</h2>
                        <p>
                            Shape your product shots and footage into video creative for your next
                            campaign.
                        </p>
                        <span className="format-link">
                            Create a video ad
                            <ArrowRight size={17} />
                        </span>
                    </div>
                </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 px-5 py-4 border border-line rounded-xl text-xs text-muted">
                <span className="flex items-center gap-3">
                    <Layers2 size={17} />
                    Looking for a starting point?
                </span>
                <Link
                    to="/winning-ads"
                    className="text-brand-ink font-medium inline-flex items-center gap-2"
                >
                    Browse winning templates
                    <ArrowRight size={14} />
                </Link>
            </div>
        </div>
    );
}
