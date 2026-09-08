import React, { useState, useRef } from 'react';

const AdCard = ({ ad, onSave }) => {
    const analysis = ad.analysis || {};
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [mediaError, setMediaError] = useState(false);

    // Check if this is marked as a video ad in analysis (backend detection)
    const isMarkedAsVideo = analysis.is_video === true;

    // Check URL types for rendering - Facebook video URLs contain various patterns
    const isVideoUrl = ad.image_url && (
        ad.image_url.includes('.mp4') ||
        ad.image_url.includes('video-') ||
        ad.image_url.includes('/v/') ||
        ad.image_url.includes('video.') ||
        (ad.image_url.includes('fbcdn') && ad.image_url.includes('_n.mp4'))
    );
    const isCdnImage = ad.image_url?.includes('scontent') && ad.image_url?.includes('fbcdn');
    const isR2Image = ad.image_url?.includes('.r2.dev') || ad.image_url?.includes('r2.cloudflarestorage');
    const isSmallThumbnail = ad.image_url?.includes('s60x60') || ad.image_url?.includes('s32x32') || ad.image_url?.includes('p50x50');
    const isPlaceholder = ad.image_url?.includes('/hads-') || ad.image_url?.includes('/hads/');
    const hasValidMedia = ad.image_url && !isSmallThumbnail && !isPlaceholder;

    // Show video indicator if marked as video OR has video URL
    const showVideoIndicator = isMarkedAsVideo || isVideoUrl;

    // Get the preview URL (library link for clicking through)
    const previewUrl = ad.video_url || `https://www.facebook.com/ads/library/?id=${ad.external_id}`;

    // Parse ad copy to extract body and potentially headline
    const rawCopy = ad.ad_copy || '';
    // Remove brand name, "Sponsored", and "Log in" from the copy
    const cleanCopy = rawCopy
        .replace(new RegExp(`^${ad.brand_name}\\s*`, 'i'), '')
        .replace(/^Sponsored\s*/i, '')
        .replace(/\s*To see this content.*$/i, '')
        .replace(/\s*Log in$/i, '')
        .trim();

    const handleVideoClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            } else {
                videoRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    // Play button overlay component
    const PlayButton = () => (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 bg-black/70 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </div>
        </div>
    );

    // Render media content based on URL type
    const renderMedia = () => {
        // If media failed to load, show fallback
        if (mediaError) {
            return (
                <div className="w-full min-h-[200px] max-h-[400px] flex items-center justify-center bg-subtle">
                    <div className="text-center">
                        <svg className="w-10 h-10 text-faint mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/>
                        </svg>
                        <span className="text-faint text-xs">View on Facebook</span>
                    </div>
                </div>
            );
        }

        // Video URL - show video with play button overlay
        if (isVideoUrl && hasValidMedia) {
            return (
                <div className="relative cursor-pointer bg-black" onClick={handleVideoClick}>
                    <video
                        ref={videoRef}
                        src={ad.image_url}
                        className="w-full max-h-[400px] object-contain bg-black"
                        muted
                        playsInline
                        loop
                        onEnded={() => setIsPlaying(false)}
                        onError={() => setMediaError(true)}
                    />
                    {!isPlaying && <PlayButton />}
                </div>
            );
        }

        // Image URL (R2 or CDN) - may be a video thumbnail
        if ((isR2Image || isCdnImage) && hasValidMedia) {
            return (
                <div className="relative">
                    <img
                        src={ad.image_url}
                        alt={ad.brand_name}
                        className="w-full max-h-[400px] object-contain bg-inset"
                        onError={() => setMediaError(true)}
                    />
                    {/* Show video badge if this is a video ad with only thumbnail */}
                    {showVideoIndicator && !isVideoUrl && (
                        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            Video
                        </div>
                    )}
                </div>
            );
        }

        // Fallback - no media available
        return (
            <div className="w-full min-h-[200px] max-h-[400px] flex items-center justify-center bg-subtle">
                <div className="text-center">
                    <svg className="w-10 h-10 text-faint mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/>
                    </svg>
                    <span className="text-faint text-xs">View on Facebook</span>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-panel rounded-lg shadow-sm border border-line overflow-hidden hover:shadow-md transition-shadow">
            {/* Header - Brand info (like Facebook) */}
            <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {ad.brand_name?.charAt(0)?.toUpperCase() || 'A'}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-foreground text-[15px] truncate leading-tight">{ad.brand_name}</h3>
                        <p className="text-xs text-muted">Sponsored</p>
                    </div>
                </div>
            </div>

            {/* Body Copy */}
            <div className="px-3 pb-2">
                <p className="text-[15px] text-foreground leading-snug whitespace-pre-line line-clamp-4">
                    {cleanCopy || 'No copy available'}
                </p>
            </div>

            {/* Media */}
            <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                onClick={(e) => isVideoUrl && hasValidMedia && e.preventDefault()}
            >
                {renderMedia()}
            </a>

            {/* Link Preview Footer (like Facebook ads) */}
            <div className="px-3 py-2 bg-subtle border-t border-line-soft">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted uppercase tracking-wide truncate">
                            {ad.platform || 'facebook'}.com
                        </p>
                        <p className="text-sm font-medium text-foreground truncate">
                            {ad.cta_text || 'Learn More'}
                        </p>
                    </div>
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-1.5 bg-soft hover:bg-line-strong text-foreground text-sm font-medium rounded transition-colors flex-shrink-0"
                    >
                        {ad.cta_text || 'Learn more'}
                    </a>
                </div>
            </div>

            {/* Actions Footer */}
            <div className="px-3 py-2 border-t border-line-soft flex items-center justify-between">
                {analysis.start_date && (
                    <span className="text-xs text-muted">
                        Started {analysis.start_date}
                    </span>
                )}
                {!analysis.start_date && <span />}

                <div className="flex items-center gap-2">
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:text-info text-sm font-medium"
                    >
                        View Original
                    </a>
                    {onSave && (
                        <button
                            onClick={() => onSave(ad)}
                            className="px-3 py-1 bg-brand text-white text-sm font-medium rounded hover:bg-brand-hover transition-colors"
                        >
                            Save
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdCard;
