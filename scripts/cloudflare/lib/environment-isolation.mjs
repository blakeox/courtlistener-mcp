const REQUIRED_ENVIRONMENTS = ['local', 'staging', 'production'];

export function validateEnvironmentMatrix(matrix) {
  const errors = [];
  const environments = matrix?.environments;

  if (matrix?.schema_version !== 'v1') {
    errors.push('Environment matrix schema_version must be v1.');
  }
  if (!environments || typeof environments !== 'object') {
    return ['Environment matrix must define environments.'];
  }

  for (const environment of REQUIRED_ENVIRONMENTS) {
    const entry = environments[environment];
    if (!entry || typeof entry !== 'object') {
      errors.push(`Missing environment definition: ${environment}`);
      continue;
    }
    if (typeof entry.deployable !== 'boolean') {
      errors.push(`${environment}.deployable must be boolean.`);
    }
    if (!Array.isArray(entry.configs)) {
      errors.push(`${environment}.configs must be an array.`);
    }
  }

  const staging = environments.staging;
  if (staging && typeof staging === 'object') {
    if (staging.provisioning_status !== 'provisioned') {
      if (!String(staging.provisioning_status ?? '').includes('template')) {
        errors.push(
          'staging.provisioning_status must be provisioned or an explicit template state.',
        );
      }
    }
    if (typeof staging.resource_prefix !== 'string' || staging.resource_prefix.length < 8) {
      errors.push('staging.resource_prefix must be an explicit non-trivial prefix.');
    }
    if (!Array.isArray(staging.required_isolation) || staging.required_isolation.length === 0) {
      errors.push('staging.required_isolation must list every isolated resource class.');
    }
    for (const [key, value] of Object.entries(staging.resource_ids ?? {})) {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`staging.resource_ids.${key} must be a non-empty string.`);
      }
    }
  }

  return errors;
}

const RESOURCE_IDENTIFIER_KEYS = new Set([
  'name',
  'id',
  'queue',
  'dataset',
  'pattern',
  'service',
  'script_name',
]);

const PROVISIONING_PLACEHOLDER_PATTERN = /^__PROVISION_[A-Z0-9_]+__$/;

export function findProvisioningPlaceholders(value, path = '', result = []) {
  if (typeof value === 'string') {
    if (PROVISIONING_PLACEHOLDER_PATTERN.test(value)) result.push({ path, value });
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      findProvisioningPlaceholders(entry, `${path}[${index}]`, result),
    );
    return result;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) =>
      findProvisioningPlaceholders(entry, path ? `${path}.${key}` : key, result),
    );
  }
  return result;
}

function collectResourceIdentifiers(value, path = '', result = [], key = '') {
  if (typeof value === 'string') {
    const isDurableObjectBindingLabel =
      key === 'name' && path.includes('durable_objects.bindings[');
    if (RESOURCE_IDENTIFIER_KEYS.has(key) && !isDurableObjectBindingLabel) {
      result.push({ path, value });
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectResourceIdentifiers(entry, `${path}[${index}]`, result, key),
    );
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) =>
      collectResourceIdentifiers(entry, path ? `${path}.${key}` : key, result, key),
    );
  }
  return result;
}

export function findResourceIdentifierOverlaps(productionConfig, stagingConfigs) {
  const productionValues = new Set(
    collectResourceIdentifiers(productionConfig).map(({ value }) => value),
  );
  const overlaps = [];

  for (const config of stagingConfigs) {
    for (const { path, value } of collectResourceIdentifiers(config.value)) {
      if (value.startsWith('__PROVISION_')) continue;
      if (productionValues.has(value)) {
        overlaps.push({ config: config.file, path, value });
      }
    }
  }

  return overlaps;
}
