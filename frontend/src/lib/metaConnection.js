export function canUseMetaConnection(connection, now = Date.now()) {
    if (!connection?.connected) return false;
    if (connection.state && connection.state !== 'connected') return false;
    if (!connection.token_expires_at) return true;
    const expiry = Date.parse(connection.token_expires_at);
    return Number.isFinite(expiry) && expiry > now;
}
