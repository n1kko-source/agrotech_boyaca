import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { toJwtUser, type JwtUser } from '../../shared/auth/jwt-user';
import { Role } from '../../shared/auth/role.enum';
import { pemFromEnv } from '../../shared/config/pem';
import type { ClimaAlertEvent, ClimaEvents } from './clima.events';

@WebSocketGateway({ namespace: '/clima', cors: { origin: false } })
@Injectable()
export class ClimaGateway implements OnGatewayConnection, ClimaEvents {
  private readonly logger = new Logger(ClimaGateway.name);

  @WebSocketServer()
  server?: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const user = await this.userFromHandshake(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    await client.join(`user:${user.sub}`);
  }

  emitAlert(userId: string, payload: ClimaAlertEvent): void {
    try {
      this.server?.to(`user:${userId}`).emit('alerta', payload);
    } catch (err) {
      this.logger.warn(
        `WS emit failed: ${err instanceof Error ? err.name : 'Error'}`,
      );
    }
  }

  private async userFromHandshake(client: Socket): Promise<JwtUser | null> {
    const raw =
      (typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : undefined) ?? bearer(client.handshake.headers.authorization);
    if (!raw) {
      return null;
    }
    const publicKey = pemFromEnv(this.config.get<string>('JWT_PUBLIC_KEY'));
    if (!publicKey) {
      return null;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtUser>(raw, {
        algorithms: ['RS256'],
        publicKey,
      });
      if (
        !payload.sub ||
        (payload.role !== Role.NATURAL &&
          payload.role !== Role.JURIDICA &&
          payload.role !== Role.ADMIN)
      ) {
        return null;
      }
      return toJwtUser(payload);
    } catch {
      return null;
    }
  }
}

function bearer(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = value.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}
