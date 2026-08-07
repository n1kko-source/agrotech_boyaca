import { AppService } from '../../src/app.service';

describe('AppService', () => {
  it('returns API greeting', () => {
    const service = new AppService();
    expect(service.getHello()).toBe('AgroTech Boyacá API');
  });
});
