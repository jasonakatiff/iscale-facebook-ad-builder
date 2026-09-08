(function () {
    let preference = 'system';
    try {
        const saved = localStorage.getItem('breadwinner:appearance');
        if (saved === 'light' || saved === 'dark') preference = saved;
    } catch {
        // Storage can be unavailable in private or restricted browsing contexts.
    }
    const theme =
        preference === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
            : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
})();
