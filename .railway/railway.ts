import { defineRailway, github, image, preserve, project, service, volume } from 'railway/iac';

// Reference-project scaffold. Seed the five preserved values through Railway first.
// Template composition replaces those values with the fields/generators in template.json.
export default defineRailway((ctx) => {
    if (ctx.projectName !== 'test-breadwinner-installer') {
        throw new Error('This scaffold only targets the isolated test-breadwinner-installer project.');
    }
    const source = github('jasonakatiff/iscale-facebook-ad-builder', { branch: 'codex/railway-installer-public-20260908' });
    const databaseVolume = volume('Database data', { sizeMB: 1024, region: 'us-west2' });
    const mediaVolume = volume('Creative media', { sizeMB: 1024, region: 'us-west2' });
    const database = service('Postgres', {
        source: image('postgres:15-bookworm'), replicas: 1,
        volumeMounts: { '/var/lib/postgresql/data': databaseVolume },
        env: {
            POSTGRES_DB: 'breadwinner', POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: preserve(),
            PGDATA: '/var/lib/postgresql/data/pgdata',
            DATABASE_URL: 'postgresql://postgres:${{Postgres.POSTGRES_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/breadwinner',
        },
    });
    const backend = service('Backend', {
        source, root: '/', replicas: 1,
        build: { builder: 'DOCKERFILE', dockerfilePath: 'backend/Dockerfile' },
        start: 'python startup.py', healthcheck: '/health/ready', healthcheckTimeout: 300,
        volumeMounts: { '/app/uploads': mediaVolume },
        env: {
            PORT: '8080', DATABASE_URL: database.env.DATABASE_URL,
            ADMIN_EMAIL: preserve(), ADMIN_PASSWORD: preserve(), SECRET_KEY: preserve(),
            OAUTH_TOKEN_ENCRYPTION_KEY: preserve(), MEDIA_STORAGE_PATH: '/app/uploads',
            REQUIRE_PERSISTENT_MEDIA: 'true',
            FRONTEND_URL: 'https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}',
            PUBLIC_API_URL: 'https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}',
            ALLOWED_ORIGINS: 'https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}',
        },
    });
    const frontend = service('Frontend', {
        source, root: '/frontend', replicas: 1,
        build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.railway' },
        start: '/docker-entrypoint.sh nginx -g "daemon off;"', healthcheck: '/', healthcheckTimeout: 60,
        env: { PORT: '8080', VITE_API_URL: 'https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1' },
    });
    const worker = service('Worker', {
        source, root: '/', replicas: 1,
        build: { builder: 'DOCKERFILE', dockerfilePath: 'backend/Dockerfile.sync-worker' },
        start: 'python -m app.sync_worker',
        env: { DATABASE_URL: database.env.DATABASE_URL, SECRET_KEY: backend.env.SECRET_KEY,
            OAUTH_TOKEN_ENCRYPTION_KEY: backend.env.OAUTH_TOKEN_ENCRYPTION_KEY },
    });
    return project('test-breadwinner-installer', { resources: [database, backend, frontend, worker, databaseVolume, mediaVolume] });
});
