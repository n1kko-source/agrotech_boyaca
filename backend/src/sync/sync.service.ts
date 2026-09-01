import { HttpException, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { WEATHER_ALERTS } from '../clima/alerts.store';
import type {
  WeatherAlertRecord,
  WeatherAlertStore,
} from '../clima/alerts.store';
import { ClimaService } from '../clima/clima.service';
import { CreateAlertaDto } from '../clima/dto/create-alerta.dto';
import { normalizeMunicipio } from '../clima/municipio';
import { CommoditiesService } from '../commodities/commodities.service';
import { normalizeCommodityLabel } from '../commodities/commodity-label';
import { UpsertPriceDto } from '../commodities/dto/upsert-price.dto';
import { PRICES_STORE } from '../commodities/prices.store';
import type { PriceRecord, PricesStore } from '../commodities/prices.store';
import { ConversationsService } from '../comunidad/conversations.service';
import type {
  ConversationRecord,
  MessageRecord,
} from '../comunidad/conversations.store';
import { CreateConversationDto } from '../comunidad/dto/create-conversation.dto';
import { CreatePostDto } from '../comunidad/dto/create-post.dto';
import { UpsertProfileDto } from '../comunidad/dto/upsert-profile.dto';
import { PostsService } from '../comunidad/posts.service';
import type { PostRecord } from '../comunidad/posts.store';
import { ProfilesService } from '../comunidad/profiles.service';
import type { ProfileRecord } from '../comunidad/profiles.store';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import type { SyncOpDto } from './dto/sync-batch.dto';
import { SyncMessagePayloadDto } from './dto/sync-message-payload.dto';
import { decideLww, parseTimestamp } from './lww';
import {
  SYNC_DELTA_LIMIT,
  type SyncEntity,
  type SyncOpStatus,
} from './sync.constants';
import type { PersistSyncOpInput, StoredSyncOp, SyncStore } from './sync.store';
import { SYNC_STORE } from './sync.store';

export type SyncOpResult = {
  opId: string;
  entity: SyncEntity;
  entityId: string;
  status: SyncOpStatus;
  reason?: string;
  record?: unknown;
};

export type SyncDelta = {
  posts: ReturnType<typeof toPostDelta>[];
  profile: ReturnType<typeof toProfileDelta> | null;
  conversations: ReturnType<typeof toConversationDelta>[];
  messages: ReturnType<typeof toMessageDelta>[];
  alertas: ReturnType<typeof toAlertaDelta>[];
};

export type SyncBatchResult = {
  serverTime: string;
  results: SyncOpResult[];
  delta: SyncDelta;
};

@Injectable()
export class SyncService {
  constructor(
    @Inject(SYNC_STORE) private readonly sync: SyncStore,
    private readonly posts: PostsService,
    private readonly profiles: ProfilesService,
    private readonly conversations: ConversationsService,
    private readonly clima: ClimaService,
    @Inject(WEATHER_ALERTS) private readonly alerts: WeatherAlertStore,
    private readonly commodities: CommoditiesService,
    @Inject(PRICES_STORE) private readonly prices: PricesStore,
  ) {}

  async apply(
    user: JwtUser,
    ops: SyncOpDto[],
    since?: string,
  ): Promise<SyncBatchResult> {
    const now = new Date();
    const results: SyncOpResult[] = [];
    for (const op of ops) {
      results.push(await this.applyOne(user, op, now));
    }
    const sinceAt = since ? parseTimestamp(since) : null;
    return {
      serverTime: now.toISOString(),
      results,
      delta: await this.delta(user.sub, sinceAt),
    };
  }

  private async applyOne(
    user: JwtUser,
    op: SyncOpDto,
    now: Date,
  ): Promise<SyncOpResult> {
    const existing = await this.sync.findOp(op.opId);
    if (existing) {
      if (existing.userId !== user.sub) {
        return {
          opId: op.opId,
          entity: op.entity,
          entityId: op.entityId,
          status: 'rejected',
          reason: 'Forbidden',
        };
      }
      return toResult(existing);
    }
    const clientTs = parseTimestamp(op.clientTs);
    if (!clientTs) {
      return this.persist(user.sub, op, {
        status: 'rejected',
        reason: 'Invalid clientTs',
        entityId: op.entityId,
      });
    }
    try {
      const result = await this.dispatch(user, op, clientTs, now);
      return await this.persist(user.sub, op, result);
    } catch (err) {
      return this.persist(user.sub, op, {
        status: 'rejected',
        reason: httpReason(err),
        entityId: op.entityId,
      });
    }
  }

  private async dispatch(
    user: JwtUser,
    op: SyncOpDto,
    clientTs: Date,
    now: Date,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    switch (op.entity) {
      case 'post':
        return this.applyPost(user.sub, op, clientTs, now);
      case 'profile':
        return this.applyProfile(user.sub, op, clientTs, now);
      case 'conversation':
        return this.applyConversation(user.sub, op);
      case 'message':
        return this.applyMessage(user.sub, op);
      case 'alerta':
        return this.applyAlerta(user.sub, op, clientTs, now);
      case 'precio':
        return this.applyPrecio(user, op, clientTs, now);
      default:
        return {
          status: 'rejected',
          reason: 'Unknown entity',
          entityId: op.entityId,
        };
    }
  }

  private async applyPost(
    userId: string,
    op: SyncOpDto,
    clientTs: Date,
    now: Date,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    const payload = await parsePayload(CreatePostDto, op.payload);
    if (!payload.ok) {
      return {
        status: 'rejected',
        reason: payload.reason,
        entityId: op.entityId,
      };
    }
    const existing = await this.posts.findById(op.entityId);
    if (existing && existing.authorId !== userId) {
      return { status: 'rejected', reason: 'Forbidden', entityId: op.entityId };
    }
    const lww = await this.decideLww('post', op.entityId, clientTs, now);
    if (lww.status !== 'apply') {
      return {
        status: lww.status,
        reason: lww.reason,
        entityId: op.entityId,
        record: existing ? toPostDelta(existing) : undefined,
      };
    }
    const saved = existing
      ? await this.posts.updateOwn(userId, op.entityId, payload.value)
      : await this.posts.create(userId, { ...payload.value, id: op.entityId });
    if (!saved) {
      return { status: 'rejected', reason: 'Not found', entityId: op.entityId };
    }
    await this.stamp('post', op.entityId, clientTs, op.opId, userId);
    return { status: 'applied', entityId: saved.id, record: saved };
  }

  private async applyProfile(
    userId: string,
    op: SyncOpDto,
    clientTs: Date,
    now: Date,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    const payload = await parsePayload(UpsertProfileDto, op.payload);
    if (!payload.ok) {
      return {
        status: 'rejected',
        reason: payload.reason,
        entityId: op.entityId,
      };
    }
    const existing = await this.profiles.findByUserId(userId);
    const lww = await this.decideLww('profile', userId, clientTs, now);
    if (lww.status !== 'apply') {
      return {
        status: lww.status,
        reason: lww.reason,
        entityId: existing?.id ?? op.entityId,
        record: existing ? toProfileDelta(existing) : undefined,
      };
    }
    const saved = await this.profiles.upsert(userId, {
      ...payload.value,
      id: existing?.id ?? op.entityId,
    });
    await this.stamp('profile', userId, clientTs, op.opId, userId);
    return { status: 'applied', entityId: saved.id, record: saved };
  }

  private async applyConversation(
    userId: string,
    op: SyncOpDto,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    const payload = await parsePayload(CreateConversationDto, op.payload);
    if (!payload.ok) {
      return {
        status: 'rejected',
        reason: payload.reason,
        entityId: op.entityId,
      };
    }
    const byId = await this.conversations.findById(op.entityId);
    if (byId) {
      if (byId.initiatorId !== userId && byId.peerId !== userId) {
        return {
          status: 'rejected',
          reason: 'Forbidden',
          entityId: op.entityId,
        };
      }
      return {
        status: 'applied',
        entityId: byId.id,
        record: toConversationDelta(byId),
      };
    }
    const started = await this.conversations.start(
      userId,
      payload.value.postId,
      op.entityId,
    );
    return {
      status: 'applied',
      entityId: started.conversation.id,
      record: started.conversation,
    };
  }

  private async applyMessage(
    userId: string,
    op: SyncOpDto,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    const payload = await parsePayload(SyncMessagePayloadDto, op.payload);
    if (!payload.ok) {
      return {
        status: 'rejected',
        reason: payload.reason,
        entityId: op.entityId,
      };
    }
    const existing = await this.conversations.findMessageById(op.entityId);
    if (existing) {
      if (existing.senderId !== userId) {
        return {
          status: 'rejected',
          reason: 'Forbidden',
          entityId: op.entityId,
        };
      }
      return {
        status: 'applied',
        entityId: existing.id,
        record: toMessageDelta(existing),
      };
    }
    const saved = await this.conversations.sendMessage(
      userId,
      payload.value.conversationId,
      payload.value.body,
      op.entityId,
    );
    return { status: 'applied', entityId: saved.id, record: saved };
  }

  private async applyAlerta(
    userId: string,
    op: SyncOpDto,
    clientTs: Date,
    now: Date,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    const payload = await parsePayload(CreateAlertaDto, op.payload);
    if (!payload.ok) {
      return {
        status: 'rejected',
        reason: payload.reason,
        entityId: op.entityId,
      };
    }
    const municipio = normalizeMunicipio(payload.value.municipio);
    if (!municipio) {
      return {
        status: 'rejected',
        reason: 'Invalid municipio',
        entityId: op.entityId,
      };
    }
    const kind = payload.value.kind;
    const current = (await this.alerts.listByUser(userId)).find(
      (row) => row.municipio === municipio && row.kind === kind,
    );
    const lww = await this.decideLww(
      'alerta',
      alertaClockKey(userId, municipio, kind),
      clientTs,
      now,
    );
    if (lww.status !== 'apply') {
      return {
        status: lww.status,
        reason: lww.reason,
        entityId: current?.id ?? op.entityId,
        record: current ? toAlertaDelta(current) : undefined,
      };
    }
    const saved = await this.clima.upsertAlert(userId, {
      ...payload.value,
      id: current?.id ?? op.entityId,
    });
    await this.stamp(
      'alerta',
      alertaClockKey(userId, municipio, kind),
      clientTs,
      op.opId,
      userId,
    );
    return { status: 'applied', entityId: saved.id, record: saved };
  }

  private async applyPrecio(
    user: JwtUser,
    op: SyncOpDto,
    clientTs: Date,
    now: Date,
  ): Promise<Omit<SyncOpResult, 'opId' | 'entity'>> {
    if (user.role !== Role.JURIDICA) {
      return { status: 'rejected', reason: 'Forbidden', entityId: op.entityId };
    }
    const payload = await parsePayload(UpsertPriceDto, op.payload);
    if (!payload.ok) {
      return {
        status: 'rejected',
        reason: payload.reason,
        entityId: op.entityId,
      };
    }
    const producto = normalizeCommodityLabel(payload.value.producto);
    const region = normalizeCommodityLabel(payload.value.region);
    const existing = await this.prices.find(producto, region);
    const lww = await this.decideLww(
      'precio',
      precioClockKey(producto, region),
      clientTs,
      now,
    );
    if (lww.status !== 'apply') {
      return {
        status: lww.status,
        reason: lww.reason,
        entityId: existing?.id ?? op.entityId,
        record: existing ? toPrecioDelta(existing) : undefined,
      };
    }
    const saved = await this.commodities.upsert(user.sub, {
      ...payload.value,
      id: existing?.id ?? op.entityId,
    });
    await this.stamp(
      'precio',
      precioClockKey(producto, region),
      clientTs,
      op.opId,
      user.sub,
    );
    return {
      status: 'applied',
      entityId: existing?.id ?? op.entityId,
      record: saved,
    };
  }

  private async decideLww(
    entity: SyncEntity,
    entityKey: string,
    clientTs: Date,
    now: Date,
  ): Promise<{ status: 'apply' } | { status: SyncOpStatus; reason: string }> {
    const serverTs = await this.sync.getClock(entity, entityKey);
    const decision = decideLww({ clientTs, serverTs, now });
    if (decision === 'reject_clock') {
      return {
        status: 'rejected',
        reason: 'clientTs outside 5-minute skew window',
      };
    }
    if (decision === 'conflict') {
      return { status: 'conflict', reason: 'Server version is newer (LWW)' };
    }
    return { status: 'apply' };
  }

  private stamp(
    entity: SyncEntity,
    entityKey: string,
    clientTs: Date,
    opId: string,
    userId: string,
  ): Promise<void> {
    return this.sync.setClock(entity, entityKey, clientTs, opId, userId);
  }

  private async persist(
    userId: string,
    op: SyncOpDto,
    result: Omit<SyncOpResult, 'opId' | 'entity'>,
  ): Promise<SyncOpResult> {
    const row: PersistSyncOpInput = {
      opId: op.opId,
      userId,
      entity: op.entity,
      entityId: result.entityId,
      status: result.status,
      reason: result.reason,
      record: result.record ?? null,
    };
    try {
      await this.sync.saveOp(row);
    } catch {
      const raced = await this.sync.findOp(op.opId);
      if (raced) {
        return toResult(raced);
      }
      throw new Error('Failed to persist sync op');
    }
    return {
      opId: op.opId,
      entity: op.entity,
      entityId: result.entityId,
      status: result.status,
      reason: result.reason,
      record: result.record,
    };
  }

  private async delta(userId: string, since: Date | null): Promise<SyncDelta> {
    if (!since) {
      return emptyDelta();
    }
    const [posts, profile, conversations, messages, alertas] =
      await Promise.all([
        this.posts.listMineSince(userId, since, SYNC_DELTA_LIMIT),
        this.profiles.findByUserId(userId),
        this.conversations.listMineSince(userId, since, SYNC_DELTA_LIMIT),
        this.conversations.listMessagesSince(userId, since, SYNC_DELTA_LIMIT),
        this.alerts.listByUser(userId),
      ]);
    const profileDelta =
      profile && profile.updatedAt.getTime() > since.getTime()
        ? toProfileDelta(profile)
        : null;
    return {
      posts: posts.map(toPostDelta),
      profile: profileDelta,
      conversations: conversations.map(toConversationDelta),
      messages: messages.map(toMessageDelta),
      alertas: alertas
        .filter((row) => row.updatedAt.getTime() > since.getTime())
        .slice(0, SYNC_DELTA_LIMIT)
        .map(toAlertaDelta),
    };
  }
}

type PayloadOk<T> = { ok: true; value: T } | { ok: false; reason: string };

async function parsePayload<T extends object>(
  cls: new () => T,
  payload: unknown,
): Promise<PayloadOk<T>> {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return { ok: false, reason: 'payload must be an object' };
  }
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    return {
      ok: false,
      reason: flattenValidation(errors).join('; ') || 'Invalid payload',
    };
  }
  return { ok: true, value: instance };
}

function flattenValidation(errors: ValidationError[]): string[] {
  const details: string[] = [];
  for (const err of errors) {
    if (err.constraints) {
      details.push(...Object.values(err.constraints));
    }
    if (err.children?.length) {
      details.push(...flattenValidation(err.children));
    }
  }
  return details;
}

function httpReason(err: unknown): string {
  if (err instanceof HttpException) {
    return err.message;
  }
  return 'Internal error';
}

function toResult(row: StoredSyncOp): SyncOpResult {
  return {
    opId: row.opId,
    entity: row.entity as SyncEntity,
    entityId: row.entityId,
    status: row.status,
    reason: row.reason,
    record: row.record ?? undefined,
  };
}

function emptyDelta(): SyncDelta {
  return {
    posts: [],
    profile: null,
    conversations: [],
    messages: [],
    alertas: [],
  };
}

function toPostDelta(
  row:
    | PostRecord
    | {
        id: string;
        authorId: string;
        title: string;
        description: string;
        category: string;
        createdAt: string;
      },
) {
  if ('createdAt' in row && typeof row.createdAt === 'string') {
    return row;
  }
  const record = row as PostRecord;
  return {
    id: record.id,
    authorId: record.authorId,
    title: record.title,
    description: record.description,
    category: record.category,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toProfileDelta(
  row:
    | ProfileRecord
    | {
        id: string;
        userId: string;
        displayName: string;
        municipality: string;
        bio: string;
        category: string;
        createdAt: string;
      },
) {
  if (
    'createdAt' in row &&
    typeof row.createdAt === 'string' &&
    !('updatedAt' in row && row.updatedAt instanceof Date)
  ) {
    return row;
  }
  const record = row as ProfileRecord;
  return {
    id: record.id,
    userId: record.userId,
    displayName: record.displayName,
    municipality: record.municipality,
    bio: record.bio,
    category: record.category,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toConversationDelta(
  row:
    | ConversationRecord
    | {
        id: string;
        postId: string;
        initiatorId: string;
        peerId: string;
        createdAt: string;
      },
) {
  if (typeof row.createdAt === 'string') {
    return row;
  }
  return {
    id: row.id,
    postId: row.postId,
    initiatorId: row.initiatorId,
    peerId: row.peerId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMessageDelta(
  row:
    | MessageRecord
    | {
        id: string;
        conversationId: string;
        senderId: string;
        body: string;
        createdAt: string;
      },
) {
  if (typeof row.createdAt === 'string') {
    return row;
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAlertaDelta(row: WeatherAlertRecord) {
  return {
    id: row.id,
    municipio: row.municipio,
    kind: row.kind,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPrecioDelta(row: PriceRecord) {
  return {
    id: row.id,
    producto: row.producto,
    region: row.region,
    precio: row.precio,
    unidad: row.unidad,
    moneda: row.moneda,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function alertaClockKey(
  userId: string,
  municipio: string,
  kind: string,
): string {
  const normalized = municipio.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${userId}:${normalized}:${kind}`;
}

function precioClockKey(producto: string, region: string): string {
  return `${producto}\0${region}`;
}
