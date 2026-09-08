function wallTime(date, timeZone) {
    if (!timeZone) throw new Error('Ad account timezone is unavailable. Sync the ad account.');
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function tomorrowInTimezone(timeZone, now = new Date()) {
    const today = wallTime(now, timeZone).slice(0, 10);
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return `${tomorrow.toISOString().slice(0, 10)}T01:00`;
}

export function accountTimeToUtc(value, timeZone) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
        throw new Error('Enter a valid start date and time.');
    const nominal = Date.parse(`${value}:00Z`);
    if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== value)
        throw new Error('Enter a valid start date and time.');
    const candidates = new Set();
    // Sample both sides of a DST boundary, including half-hour timezone changes.
    for (const hours of [-36, -12, 0, 12, 36]) {
        const sample = nominal + hours * 3600000;
        const offset = Date.parse(`${wallTime(new Date(sample), timeZone)}:00Z`) - sample;
        const candidate = nominal - offset;
        if (wallTime(new Date(candidate), timeZone) === value) candidates.add(candidate);
    }
    if (candidates.size !== 1)
        throw new Error(
            'This time is skipped or repeated by daylight saving. Choose another start time.',
        );
    return new Date([...candidates][0]).toISOString();
}
