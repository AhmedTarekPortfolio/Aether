import { NvidiaParameterDefinition } from './types';

const FORBIDDEN_PARAM_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates and sanitizes model-specific parameters against parameter definitions.
 * Protects against prototype pollution and invalid payload formats.
 */
export function validateAndSanitizeParameters(
  paramDefs?: NvidiaParameterDefinition[],
  paramValues?: Record<string, any>
): { valid: boolean; cleanParams: Record<string, any>; errors: string[] } {
  const cleanParams: Record<string, any> = {};
  const errors: string[] = [];

  if (!paramValues) {
    return { valid: true, cleanParams: {}, errors: [] };
  }

  // 1. Prototype Pollution Guard
  for (const key of Object.keys(paramValues)) {
    if (FORBIDDEN_PARAM_KEYS.has(key.toLowerCase())) {
      errors.push(`Forbidden parameter key '${key}' detected (prototype pollution guard).`);
      return { valid: false, cleanParams: {}, errors };
    }
  }

  if (!paramDefs || paramDefs.length === 0) {
    // If no definitions provided, copy clean non-prototype values
    for (const [k, v] of Object.entries(paramValues)) {
      if (!FORBIDDEN_PARAM_KEYS.has(k.toLowerCase()) && v !== undefined && v !== '') {
        cleanParams[k] = v;
      }
    }
    return { valid: errors.length === 0, cleanParams, errors };
  }

  // 2. Validate against definitions
  for (const def of paramDefs) {
    const val = paramValues[def.key];

    if (val === undefined || val === null || val === '') {
      if (def.required) {
        errors.push(`Parameter '${def.label || def.key}' is required.`);
      }
      continue;
    }

    if (def.type === 'number') {
      const num = Number(val);
      if (isNaN(num)) {
        errors.push(`Parameter '${def.label}' must be a number.`);
      } else {
        if (def.minimum !== undefined && num < def.minimum) {
          errors.push(`Parameter '${def.label}' must be >= ${def.minimum}.`);
        }
        if (def.maximum !== undefined && num > def.maximum) {
          errors.push(`Parameter '${def.label}' must be <= ${def.maximum}.`);
        }
        cleanParams[def.key] = num;
      }
    } else if (def.type === 'boolean') {
      cleanParams[def.key] = Boolean(val);
    } else if (def.type === 'select') {
      if (def.options && def.options.length > 0) {
        const isValidOption = def.options.some((opt) => String(opt.value) === String(val));
        if (!isValidOption) {
          errors.push(`Parameter '${def.label}' value is not in allowed select options.`);
        } else {
          cleanParams[def.key] = val;
        }
      } else {
        cleanParams[def.key] = String(val);
      }
    } else if (def.type === 'json') {
      if (typeof val === 'object') {
        cleanParams[def.key] = val;
      } else {
        try {
          cleanParams[def.key] = JSON.parse(String(val));
        } catch {
          errors.push(`Parameter '${def.label}' contains invalid JSON.`);
        }
      }
    } else {
      cleanParams[def.key] = String(val);
    }
  }

  return { valid: errors.length === 0, cleanParams, errors };
}
