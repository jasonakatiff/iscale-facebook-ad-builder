import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchableSelect } from '../components/SearchableSelect';
import { PlacementPicker } from '../components/PlacementPicker';
import { ValidationErrors } from '../components/ValidationErrors';

describe('feedback controls', () => {
    it('searches sorted pages without selecting one automatically', () => {
        const onChange = vi.fn();
        render(
            <SearchableSelect
                label="Facebook Page"
                value=""
                options={[
                    { id: '2', name: 'Zulu' },
                    { id: '1', name: 'Alpha' },
                ]}
                onChange={onChange}
            />,
        );
        expect(onChange).not.toHaveBeenCalled();
        const input = screen.getByRole('combobox', { name: 'Facebook Page' });
        fireEvent.focus(input);
        expect(screen.getAllByRole('option').map((x) => x.textContent)).toEqual(['Alpha', 'Zulu']);
        fireEvent.change(input, { target: { value: 'zul' } });
        fireEvent.click(screen.getByRole('option', { name: 'Zulu' }));
        expect(onChange).toHaveBeenCalledWith('2');
    });
    it('supports keyboard page selection', () => {
        const onChange = vi.fn();
        render(
            <SearchableSelect
                label="Page"
                value=""
                options={[{ id: '1', name: 'Alpha' }]}
                onChange={onChange}
            />,
        );
        const input = screen.getByRole('combobox');
        fireEvent.focus(input);
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('1');
    });
    it('excludes an individual placement while preserving its platform', () => {
        const onChange = vi.fn();
        render(
            <PlacementPicker
                targeting={{
                    publisher_platforms: ['facebook'],
                    facebook_positions: ['feed', 'story'],
                }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByRole('checkbox', { name: 'Facebook Stories' }));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                publisher_platforms: ['facebook'],
                facebook_positions: ['feed'],
            }),
        );
    });
    it('announces field-level errors', () => {
        render(
            <ValidationErrors
                errors={[{ field: 'creativeData.websiteUrl', message: 'Website URL is required.' }]}
            />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Website URL is required.');
    });
});
