export const ENTITY_TYPES = ['asociacion', 'cooperativa', 'empresa'] as const;

export type EntityTypeValue = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_DB = {
  asociacion: 'ASOCIACION',
  cooperativa: 'COOPERATIVA',
  empresa: 'EMPRESA',
} as const;
