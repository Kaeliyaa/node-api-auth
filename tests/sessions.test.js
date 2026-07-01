// tests/sessions.test.js
const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool')

describe('Sessions (protected route)', () => {
  let token;
  const testUser = { email: 'sessiontest@example.com', password: 'password123' };

  beforeAll(async () => {
    await request(app).post('/auth/register').send(testUser);
    const res = await request(app).post('/auth/login').send(testUser);
    token = res.body.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    await pool.end();
  });

  test('rejects request with no token', async () => {
    const res = await request(app).get('/sessions');
    expect(res.statusCode).toBe(401);
  });

  test('rejects request with garbage token', async () => {
    const res = await request(app).get('/sessions').set('Authorization', 'Bearer garbage.token.here');
    expect(res.statusCode).toBe(401);
  });

  test('allows request with valid token', async () => {
    const res = await request(app).get('/sessions').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});