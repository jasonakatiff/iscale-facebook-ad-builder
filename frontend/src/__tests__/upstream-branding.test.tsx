import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('upstream configurable branding', () => {
    it('retains configured workspace identity in the refreshed shell mark', async () => {
        vi.stubEnv('VITE_APP_NAME', 'test-Creative Workspace');
        vi.stubEnv('VITE_APP_TAGLINE', 'test-Your campaign team');
        vi.stubEnv('VITE_APP_LOGO', '/test-workspace-logo.svg');
        const { BrandMark } = await import('../components/BrandMark');
        render(<BrandMark />);
        expect(screen.getByText('test-Creative Workspace')).toBeInTheDocument();
        expect(screen.getByText('test-Your campaign team')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('src', '/test-workspace-logo.svg');
    });
});
