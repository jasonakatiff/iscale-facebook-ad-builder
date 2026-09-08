import { useId } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const choices = [
    { value: 'light', label: 'Light theme', icon: Sun },
    { value: 'dark', label: 'Dark theme', icon: Moon },
    { value: 'system', label: 'System theme', icon: Monitor },
];

export function ThemeSwitch() {
    const { preference, setPreference } = useTheme();
    const name = useId();
    return (
        <fieldset className="theme-switch">
            <legend className="sr-only">Appearance</legend>
            {choices.map((choice) => {
                const { value, label, icon: Icon } = choice;
                return (
                    <label
                        key={value}
                        title={label}
                        className="theme-choice"
                        data-selected={preference === value}
                    >
                        <input
                            className="theme-radio"
                            type="radio"
                            name={name}
                            value={value}
                            checked={preference === value}
                            onChange={() => setPreference(value)}
                            aria-label={label}
                        />
                        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    </label>
                );
            })}
        </fieldset>
    );
}
