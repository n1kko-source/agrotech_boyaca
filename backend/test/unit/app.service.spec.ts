import { AppService } from '../../src/app.service';

describe('AppService', () => {
  it('returns API greeting', () => {
    const service = new AppService();
    expect(service.getHello()).toBe('AgroTech Boyacá API');
  });

  it('returns health payload', () => {
    const service = new AppService();
    const health = service.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('agrotech-backend');
    expect(health.timestamp).toEqual(expect.any(String));
  });
});
