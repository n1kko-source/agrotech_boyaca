import { Injectable } from '@nestjs/common';

export type HealthStatus = {
  status: 'ok';
  service: string;
  timestamp: string;
};

@Injectable()
export class AppService {
  getHello(): string {
    return 'AgroTech Boyacá API';
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'agrotech-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
