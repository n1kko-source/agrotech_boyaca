export const ENTITY_TYPES = ['asociacion', 'cooperativa', 'empresa'] as const;

export type EntityTypeValue = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_DB = {
  asociacion: 'ASOCIACION',
  cooperativa: 'COOPERATIVA',
  empresa: 'EMPRESA',
} as const;

export const ENTITY_TYPE_API = {
  ASOCIACION: 'asociacion',
  COOPERATIVA: 'cooperativa',
  EMPRESA: 'empresa',
} as const;

export function isEntityType(value: unknown): value is EntityTypeValue {
  return (
    value === 'asociacion' || value === 'cooperativa' || value === 'empresa'
  );
}

export function entityTypeFromDb(value: string): EntityTypeValue | null {
  if (
    value === 'ASOCIACION' ||
    value === 'COOPERATIVA' ||
    value === 'EMPRESA'
  ) {
    return ENTITY_TYPE_API[value];
  }
  return null;
}
