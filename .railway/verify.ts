import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRailwayContext, project } from 'railway/iac';
import definition from './railway.js';

const result = await definition(createRailwayContext({ projectName: 'test-breadwinner-installer' }), project);
const resources = (result.resources || []).flat();
assert.equal(resources.length, 6);
const spec = JSON.parse(readFileSync(new URL('./template.json', import.meta.url), 'utf8'));
assert.deepEqual(spec.installFields.map((item: {variable: string}) => item.variable), ['ADMIN_EMAIL', 'ADMIN_PASSWORD']);
assert.equal(spec.generatedVariables.length, 3);
const services = resources.filter(item => item.type === 'service');
assert.equal(services.length, 4);
for (const resource of services) {
    if (resource.type !== 'service') continue;
    assert.equal(resource.deploy?.numReplicas, 1);
    const root = resource.source?.rootDirectory || '/';
    if (resource.build?.dockerfilePath) {
        assert(existsSync(new URL(`../${root.replace(/^\//, '')}/${resource.build.dockerfilePath}`, import.meta.url)));
    }
    if (spec.privateServices.includes(resource.name)) assert(!resource.networking?.serviceDomains);
    if (resource.name === 'Frontend') {
        assert.deepEqual(Object.keys(resource.variables || {}).sort(), ['PORT', 'VITE_API_URL']);
    }
}
assert.throws(() => definition(createRailwayContext({ projectName: 'production' }), project));
console.log('Validated four services, two volumes, build paths, frontend secret isolation, two install fields, and target guard. Cloud provisioning remains unverified.');
