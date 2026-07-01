const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

// Mock Resend so tests never send real emails
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'mock-email-id' }) }
  }))
}));

describe('Auth', () => {
  const testUser = { email: 'testuser@example.com', password: 'password123' };

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    await pool.end();
  });

  test('registers a new user', async () => {
    const res = await request(app).post('/auth/register').send(testUser);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
  });

  test('rejects duplicate registration', async () => {
    const res = await request(app).post('/auth/register').send(testUser);
    expect(res.statusCode).toBe(409);
  });

  test('rejects registration with missing password', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'nopass@example.com' });
    expect(res.statusCode).toBe(400);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app).post('/auth/login').send(testUser);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('rejects login with wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email: testUser.email, password: 'wrongpass' });
    expect(res.statusCode).toBe(401);
  });
});