export const SKIN_STORAGE_KEY = 'breadwinner:skin:v1';
const COLOR = /^#[0-9a-fA-F]{6}$/;
export const PALETTE_FIELDS = [
    'canvas',
    'panel',
    'text',
    'muted',
    'accent',
    'accentText',
    'accentInk',
    'border',
];
export const BUILTIN_SKINS = [
    {
        id: 'workflow',
        version: 1,
        name: 'Workflow',
        light: {
            canvas: '#F6F7F8',
            panel: '#FFFFFF',
            text: '#222936',
            muted: '#5C6677',
            accent: '#295AD4',
            accentText: '#FFFFFF',
            accentInk: '#295AD4',
            border: '#DDE1E7',
        },
        dark: {
            canvas: '#171A20',
            panel: '#1E222A',
            text: '#E8ECF3',
            muted: '#ACB6C5',
            accent: '#295AD4',
            accentText: '#FFFFFF',
            accentInk: '#9AB7FF',
            border: '#363D48',
        },
    },
    {
        id: 'breadwinner',
        version: 1,
        name: 'BreadWinner Classic',
        light: {
            canvas: '#F6F7F3',
            panel: '#FDFDFA',
            text: '#21261E',
            muted: '#636C5C',
            accent: '#97560D',
            accentText: '#FFFFFF',
            accentInk: '#894E0B',
            border: '#DDE2D5',
        },
        dark: {
            canvas: '#171A16',
            panel: '#1D211B',
            text: '#EBF0E4',
            muted: '#9BA68E',
            accent: '#97560D',
            accentText: '#FFFFFF',
            accentInk: '#E4B973',
            border: '#363F2D',
        },
    },
    {
        id: 'forest',
        version: 1,
        name: 'Forest',
        light: {
            canvas: '#F4F8F6',
            panel: '#FFFFFF',
            text: '#173B2E',
            muted: '#526C60',
            accent: '#1B7052',
            accentText: '#FFFFFF',
            accentInk: '#1B7052',
            border: '#D4E4DB',
        },
        dark: {
            canvas: '#131E1A',
            panel: '#1C2A23',
            text: '#E5F2EB',
            muted: '#A6C2B2',
            accent: '#1B7052',
            accentText: '#FFFFFF',
            accentInk: '#84D2AB',
            border: '#365043',
        },
    },
];
const rgb = (hex) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const blend = (a, b, weight) =>
    rgb(a)
        .map((value, index) =>
            Math.round(value * weight + rgb(b)[index] * (1 - weight)),
        )
        .join(' ');
function luminance(hex) {
    return rgb(hex)
        .map((channel) => channel / 255)
        .map((value) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        )
        .reduce(
            (sum, value, index) =>
                sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
        );
}
function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (values[1] + 0.05) / (values[0] + 0.05);
}
export function themeDocument(skin) {
    return {
        version: skin.version,
        name: skin.name,
        light: skin.light,
        dark: skin.dark,
    };
}
export function validateSkin(value) {
    if (
        !value ||
        value.version !== 1 ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        value.name.length > 80
    )
        throw new Error(
            'Use a version 1 theme with a name of 1–80 characters.',
        );
    if (
        Object.keys(value).some(
            (key) => !['version', 'name', 'light', 'dark'].includes(key),
        )
    )
        throw new Error(
            'Themes contain only version, name, light, and dark palettes.',
        );
    for (const mode of ['light', 'dark']) {
        const palette = value[mode];
        if (
            !palette ||
            Object.keys(palette).length !== PALETTE_FIELDS.length ||
            PALETTE_FIELDS.some((field) => !COLOR.test(palette[field]))
        )
            throw new Error(
                `${mode} palette needs all eight colors as six-digit hex values.`,
            );
        for (const [foreground, background] of [
            ['text', 'canvas'],
            ['text', 'panel'],
            ['muted', 'canvas'],
            ['muted', 'panel'],
            ['accentText', 'accent'],
            ['accentInk', 'panel'],
        ]) {
            if (contrast(palette[foreground], palette[background]) < 4.5)
                throw new Error(
                    `${mode}: ${foreground} against ${background} needs at least 4.5:1 contrast.`,
                );
        }
    }
    return themeDocument(value);
}
export function applySkinTokens(root, skin, mode) {
    const palette = skin[mode];
    const direct = {
        canvas: 'canvas',
        panel: 'panel',
        elevated: 'panel',
        foreground: 'text',
        secondary: 'text',
        muted: 'muted',
        faint: 'muted',
        line: 'border',
        'line-strong': 'border',
        brand: 'accent',
        'brand-ink': 'accentInk',
        'brand-contrast': 'accentText',
    };
    for (const [token, field] of Object.entries(direct))
        root.style.setProperty(
            `--studio-${token}`,
            rgb(palette[field]).join(' '),
        );
    for (const token of ['subtle', 'inset', 'soft'])
        root.style.setProperty(
            `--studio-${token}`,
            blend(palette.text, palette.panel, 0.04),
        );
    root.style.setProperty(
        '--studio-line-soft',
        blend(palette.border, palette.panel, 0.6),
    );
    root.style.setProperty(
        '--studio-brand-soft',
        blend(palette.accent, palette.panel, 0.09),
    );
    root.style.setProperty(
        '--studio-brand-line',
        blend(palette.accent, palette.panel, 0.4),
    );
    root.style.setProperty(
        '--studio-brand-hover',
        blend(palette.accent, '#000000', 0.86),
    );
}
