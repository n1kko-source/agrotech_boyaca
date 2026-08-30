import type { AlertKind } from '../clima.constants';

export const CLIMA_EVENTS = Symbol('CLIMA_EVENTS');

export type ClimaAlertEvent = {
  municipio: string;
  kind: AlertKind;
  title: string;
  body: string;
};

export interface ClimaEvents {
  emitAlert(userId: string, payload: ClimaAlertEvent): void;
}
