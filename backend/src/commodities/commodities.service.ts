import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../auth/users/users.repository';
import { Role } from '../shared/auth/role.enum';
import { KV_STORE } from '../shared/redis/kv-store';
import type { KvStore } from '../shared/redis/kv-store';
import { commodityCacheKey, normalizeCommodityLabel } from './commodity-label';
import {
  COMMODITY_PRICE_CACHE_TTL_SECONDS,
  COMMODITY_UNIDAD_DEFAULT,
} from './commodity.constants';
import { PRICES_STORE } from './prices.store';
import type { PriceRecord, PricesStore } from './prices.store';

export type PriceView = {
  producto: string;
  region: string;
  precio: number;
  unidad: string;
  moneda: string;
  updatedAt: string;
  cached: boolean;
};

@Injectable()
export class CommoditiesService {
  constructor(
    @Inject(PRICES_STORE) private readonly prices: PricesStore,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  async upsert(
    reporterId: string,
    input: {
      producto: string;
      region: string;
      precio: number;
      unidad?: string;
    },
  ): Promise<PriceView> {
    await this.assertVerifiedJuridica(reporterId);
    const producto = normalizeCommodityLabel(input.producto);
    const region = normalizeCommodityLabel(input.region);
    const unidad = input.unidad
      ? normalizeCommodityLabel(input.unidad)
      : COMMODITY_UNIDAD_DEFAULT;
    const row = await this.prices.upsert({
      producto,
      region,
      precio: input.precio,
      unidad,
      reportedBy: reporterId,
    });
    await this.invalidate(producto, region);
    return toView(row, false);
  }

  async get(productoRaw: string, regionRaw: string): Promise<PriceView> {
    const producto = normalizeCommodityLabel(productoRaw);
    const region = normalizeCommodityLabel(regionRaw);
    const cached = await this.readCache(producto, region);
    if (cached) {
      return { ...cached, cached: true };
    }
    const row = await this.prices.find(producto, region);
    if (!row) {
      throw new NotFoundException('Not found');
    }
    const view = toView(row, false);
    await this.writeCache(producto, region, view);
    return view;
  }

  private async assertVerifiedJuridica(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.role !== Role.JURIDICA || !user.verified) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async readCache(
    producto: string,
    region: string,
  ): Promise<PriceView | null> {
    try {
      const raw = await this.kv.get(commodityCacheKey(producto, region));
      if (!raw) {
        return null;
      }
      return parseCached(raw);
    } catch {
      return null;
    }
  }

  private async writeCache(
    producto: string,
    region: string,
    view: PriceView,
  ): Promise<void> {
    try {
      const payload = JSON.stringify({
        producto: view.producto,
        region: view.region,
        precio: view.precio,
        unidad: view.unidad,
        moneda: view.moneda,
        updatedAt: view.updatedAt,
      });
      await this.kv.set(
        commodityCacheKey(producto, region),
        payload,
        COMMODITY_PRICE_CACHE_TTL_SECONDS,
      );
    } catch {
      // Source of truth is Postgres; cache is optional.
    }
  }

  private async invalidate(producto: string, region: string): Promise<void> {
    try {
      await this.kv.del(commodityCacheKey(producto, region));
    } catch {
      // Next GET will miss or serve stale until TTL.
    }
  }
}

function toView(row: PriceRecord, cached: boolean): PriceView {
  return {
    producto: row.producto,
    region: row.region,
    precio: row.precio,
    unidad: row.unidad,
    moneda: row.moneda,
    updatedAt: row.updatedAt.toISOString(),
    cached,
  };
}

function parseCached(raw: string): PriceView | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PriceView>;
    if (
      typeof parsed.producto !== 'string' ||
      typeof parsed.region !== 'string' ||
      typeof parsed.precio !== 'number' ||
      typeof parsed.unidad !== 'string' ||
      typeof parsed.moneda !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    return {
      producto: parsed.producto,
      region: parsed.region,
      precio: parsed.precio,
      unidad: parsed.unidad,
      moneda: parsed.moneda,
      updatedAt: parsed.updatedAt,
      cached: true,
    };
  } catch {
    return null;
  }
}
