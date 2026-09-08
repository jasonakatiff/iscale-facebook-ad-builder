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
const template = JSON.parse(readFileSync(new URL('./serialized-template.json', import.meta.url), 'utf8'));
const templateServices = Object.values(template.services) as Array<{
    name: string; source: { repo?: string; branch?: string };
    variables: Record<string, { defaultValue: string; preserveExisting?: boolean; value?: string }>;
    networking: { serviceDomains?: Record<string, { port: number }> };
}>;
assert.equal(templateServices.length, 4);
const customerInputs: string[] = [];
for (const service of templateServices) {
    if (service.source.repo) {
        assert.equal(service.source.repo, spec.sourceRepository);
        assert.equal(service.source.branch, spec.sourceBranch);
    }
    for (const [key, variable] of Object.entries(service.variables)) {
        assert.equal(variable.value, undefined, 'Template must not contain resolved values');
        if (variable.defaultValue === '') customerInputs.push(key);
        if (variable.defaultValue === '' || variable.defaultValue.includes('${{secret(')) {
            assert.equal(variable.preserveExisting, true, 'Updates must preserve installation credentials');
        }
    }
    if (spec.publicServices.includes(service.name)) {
        assert.equal(service.networking.serviceDomains?.['<hasDomain>'].port, 8080);
    } else assert.equal(service.networking.serviceDomains, undefined);
}
assert.deepEqual(customerInputs.sort(), ['ADMIN_EMAIL', 'ADMIN_PASSWORD']);
console.log('Validated four services, two volumes, build paths, public source, two owner inputs, generated domains, credential preservation, and target guard. Cloud results are recorded separately.');
