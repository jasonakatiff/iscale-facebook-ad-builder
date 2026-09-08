import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

const key = 'breadwinner:appearance';
let media;
let listeners;

function Controls() {
    const { preference, resolvedTheme, setPreference } = useTheme();
    return (
        <div>
            <output>
                {preference}:{resolvedTheme}
            </output>
            {['light', 'dark', 'system'].map((value) => (
                <button key={value} onClick={() => setPreference(value)}>
                    {value}
                </button>
            ))}
        </div>
    );
}

function mount() {
    return render(
        <ThemeProvider>
            <Controls />
        </ThemeProvider>,
    );
}

function systemTheme(dark) {
    act(() => {
        media.matches = dark;
        listeners.forEach((listener) => listener({ matches: dark }));
    });
}

beforeEach(() => {
    listeners = new Set();
    media = {
        matches: false,
        addEventListener: vi.fn((_, listener) => listeners.add(listener)),
        removeEventListener: vi.fn((_, listener) => listeners.delete(listener)),
    };
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => media),
    );
    localStorage.getItem.mockReturnValue(null);
    localStorage.setItem.mockImplementation(() => {});
    document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('studio appearance', () => {
    it('uses system preference and follows system changes', () => {
        mount();
        expect(screen.getByText('system:light')).toBeInTheDocument();
        systemTheme(true);
        expect(screen.getByText('system:dark')).toBeInTheDocument();
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('restores an explicit preference and ignores system changes', () => {
        localStorage.getItem.mockReturnValue('light');
        media.matches = true;
        mount();
        expect(screen.getByText('light:light')).toBeInTheDocument();
        systemTheme(false);
        systemTheme(true);
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('persists a choice and resumes system tracking when selected', () => {
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'dark', exact: true }));
        expect(localStorage.setItem).toHaveBeenCalledWith(key, 'dark');
        expect(screen.getByText('dark:dark')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'system', exact: true }));
        expect(screen.getByText('system:light')).toBeInTheDocument();
    });

    it('falls back to system for invalid stored values', () => {
        localStorage.getItem.mockReturnValue('invalid');
        mount();
        expect(screen.getByText('system:light')).toBeInTheDocument();
    });

    it('keeps switching usable when browser storage is unavailable', () => {
        localStorage.getItem.mockImplementation(() => {
            throw new Error('Storage blocked');
        });
        localStorage.setItem.mockImplementation(() => {
            throw new Error('Storage blocked');
        });
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'dark', exact: true }));
        expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('synchronizes preferences from another tab, including reset', () => {
        mount();
        act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'dark' })));
        expect(screen.getByText('dark:dark')).toBeInTheDocument();
        act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: null })));
        expect(screen.getByText('system:light')).toBeInTheDocument();
    });

    it('removes the system listener on unmount', () => {
        const { unmount } = mount();
        unmount();
        expect(listeners.size).toBe(0);
    });
});
