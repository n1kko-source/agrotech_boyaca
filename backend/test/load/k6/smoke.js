import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Minimal smoke test for Sprint 0 / AG-11.
 * Hits the NestJS root endpoint once the API is up in CI.
 */
export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export default function () {
  const root = http.get(`${BASE_URL}/`);
  check(root, {
    'root status is 200': (r) => r.status === 200,
    'root body mentions AgroTech': (r) => String(r.body).includes('AgroTech'),
  });

  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health status is 200': (r) => r.status === 200,
    'health status ok': (r) => String(r.body).includes('"status":"ok"'),
  });

  sleep(1);
}
