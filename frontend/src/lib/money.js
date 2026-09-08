export function moneyToMinor(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text))
        throw new Error('Enter a nonnegative amount with at most two decimal places.');
    const [whole, fraction = ''] = text.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.');
    return Number(minor);
}

export function minorToMoney(value) {
    const minor = BigInt(value || 0);
    return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}
