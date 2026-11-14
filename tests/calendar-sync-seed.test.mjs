import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makePlan, localTimestamp, sandboxClient, preflight, seed, cleanup, verify, ORIGIN } from '../scripts/calendar-sync-seed.mjs';

function fakeSquare() {
  const calls = [], shifts = new Map(), members = new Map(), keys = new Map();
  const location = { id: 'TEST_LOCATION', merchant_id: 'TEST_MERCHANT', timezone: 'America/Los_Angeles', status: 'ACTIVE', currency: 'USD' };
  let count = 0, failPublish = false;
  const api = async (path, body, method = body ? 'POST' : 'GET') => {
    calls.push({ path, body: structuredClone(body), method });
    if (path === '/v2/locations') return { locations: [location] };
    if (body?.idempotency_key && keys.has(body.idempotency_key)) return structuredClone(keys.get(body.idempotency_key));
    let result;
    if (path === '/v2/team-members/jobs') result = { job: { ...body.job, id: `job-${++count}` } };
    else if (path === '/v2/team-members') {
      assert.equal(body.team_member.wage_setting, undefined, 'Square requires profile creation before job assignment');
      const member = { ...body.team_member, id: `member-${++count}` }; members.set(member.id, member); result = { team_member: member };
    } else if (path.endsWith('/wage-setting')) {
      const member = members.get(path.split('/')[3]);
      if (method === 'PUT') member.testWageSetting = body.wage_setting;
      result = { wage_setting: member.testWageSetting ?? { job_assignments: [] } };
    } else if (path.startsWith('/v2/team-members/')) {
      const member = members.get(path.split('/').at(-1));
      if (method === 'PUT') Object.assign(member, body.team_member);
      result = { team_member: member };
    } else if (path === '/v2/labor/scheduled-shifts') {
      assert.ok(members.get(body.scheduled_shift.draft_shift_details.team_member_id)?.testWageSetting?.job_assignments?.length, 'Scheduled employees require an assigned job');
      const shift = { ...body.scheduled_shift, id: `shift-${++count}`, version: 1 }; shifts.set(shift.id, shift); result = { scheduled_shift: shift };
    } else {
      const id = path.split('/')[4], shift = shifts.get(id);
      if (!shift) { const error = new Error('NOT_FOUND'); error.status = 404; throw error; }
      if (path.endsWith('/publish')) {
        if (failPublish) { failPublish = false; throw new Error('Temporary publish failure'); }
        assert.equal(body.version, shift.version);
        assert.equal(body.scheduled_shift_notification_audience, 'NONE');
        shift.published_shift_details = { ...shift.draft_shift_details }; shift.version++;
      } else if (method === 'PUT') {
        assert.equal(body.scheduled_shift.version, shift.version);
        shift.draft_shift_details = { ...shift.draft_shift_details, ...body.scheduled_shift.draft_shift_details }; shift.version++;
      }
      result = { scheduled_shift: shift };
      if (shift.draft_shift_details.is_deleted && (!shift.published_shift_details || shift.published_shift_details.is_deleted)) shifts.delete(id);
    }
    if (body?.idempotency_key) keys.set(body.idempotency_key, structuredClone(result));
    return structuredClone(result);
  };
  return { api, calls, shifts, members, location, failNextPublish: () => { failPublish = true; } };
}

const plan = () => makePlan({ run: 'controlled', date: '2026-10-05', days: 3 });
test('plan creates overlapping published shifts and a draft control, with strict inputs', () => {
  const state = plan();
  assert.equal(state.shifts.filter(s => s.publish).length, 6);
  assert.equal(state.shifts.filter(s => !s.publish).length, 1);
  for (const date of ['2026-02-30', 'bad']) assert.throws(() => makePlan({ run: 'test', date }));
  for (const days of [0, 15, 1.5, NaN]) assert.throws(() => makePlan({ run: 'test', date: '2026-10-05', days }));
  assert.throws(() => makePlan({ run: '../escape', date: '2026-10-05' }));
});

test('location timestamps follow DST and non-hour offsets', () => {
  assert.equal(localTimestamp('2026-10-31', 9, 'America/Los_Angeles'), '2026-10-31T09:00:00-07:00');
  assert.equal(localTimestamp('2026-11-01', 9, 'America/Los_Angeles'), '2026-11-01T09:00:00-08:00');
  assert.equal(localTimestamp('2026-10-05', 9, 'Asia/Kathmandu'), '2026-10-05T09:00:00+05:45');
});

test('client pins Sandbox, disables redirects, never calls timecards, and redacts errors', async () => {
  assert.throws(() => sandboxClient(''), /Missing SQUARE_SANDBOX/);
  const token = 'private-secret';
  const api = sandboxClient(token, async (url, init) => {
    assert.equal(new URL(url).origin, ORIGIN); assert.equal(init.redirect, 'error');
    return { ok: false, status: 401, json: async () => ({ errors: [{ code: 'UNAUTHORIZED', detail: token }] }) };
  });
  await assert.rejects(api('/v2/locations'), error => error.message.includes('UNAUTHORIZED') && !error.message.includes(token));
  await assert.rejects(api('/v2/labor/timecards', {}), /Only Sandbox/);
  await assert.rejects(api('https://connect.squareup.com/v2/locations'), /Only Sandbox/);
});

test('preflight rejects a different merchant before any mutation', async () => {
  const fake = fakeSquare(), state = plan();
  await preflight(fake.api, state);
  fake.location.merchant_id = 'OTHER';
  await assert.rejects(preflight(fake.api, state), /different location, merchant/);
  assert.ok(fake.calls.every(c => c.method === 'GET'));
});

test('repeated seeding does not duplicate jobs, members, shifts, or publish operations', async () => {
  const fake = fakeSquare(), state = plan(); let checkpoints = 0;
  await preflight(fake.api, state);
  assert.deepEqual(await seed(fake.api, state, async () => checkpoints++), { published: 6, drafts: 1 });
  const writes = fake.calls.filter(c => c.method !== 'GET').length;
  await seed(fake.api, state, async () => checkpoints++);
  assert.equal(fake.calls.filter(c => c.method !== 'GET').length, writes);
  assert.equal(fake.members.size, 2); assert.equal(fake.shifts.size, 7);
  assert.ok(checkpoints > 7);
  assert.ok([...fake.members.values()].every(m => !m.email_address && !m.phone_number && !m.wage_setting));
});

test('interrupted publish resumes using the recorded shift without recreating it', async () => {
  const fake = fakeSquare(), state = plan(); let saved;
  await preflight(fake.api, state); fake.failNextPublish();
  await assert.rejects(seed(fake.api, state, async () => { saved = structuredClone(state); }), /Temporary publish/);
  assert.ok(saved.shifts[0].id);
  await seed(fake.api, saved, async () => {});
  assert.equal(fake.shifts.size, 7);
  assert.equal(fake.calls.filter(c => c.path === '/v2/labor/scheduled-shifts').length, 7);
});

test('a lost create response can be retried with the same idempotency key', async () => {
  const fake = fakeSquare(), state = plan(); let lost = true;
  await preflight(fake.api, state);
  const api = async (...args) => {
    const response = await fake.api(...args);
    if (args[0] === '/v2/labor/scheduled-shifts' && lost) { lost = false; throw new Error('Response lost'); }
    return response;
  };
  await assert.rejects(seed(api, state, async () => {}), /Response lost/);
  await seed(api, state, async () => {});
  assert.equal(fake.shifts.size, 7);
});

test('cleanup removes only recorded shifts, suppresses notifications, and is repeatable', async () => {
  const fake = fakeSquare(), state = plan();
  await preflight(fake.api, state); await seed(fake.api, state, async () => {});
  fake.shifts.set('unrelated', { id: 'unrelated', draft_shift_details: { notes: 'Leave alone' } });
  await cleanup(fake.api, state, async () => {});
  assert.ok(state.cleanedAt);
  assert.equal(fake.shifts.get('unrelated').draft_shift_details.is_deleted, undefined);
  assert.ok([...fake.members.values()].every(m => m.status === 'INACTIVE'));
  const writes = fake.calls.filter(c => c.method !== 'GET').length;
  await cleanup(fake.api, state, async () => {});
  assert.equal(fake.calls.filter(c => c.method !== 'GET').length, writes);
  await assert.rejects(seed(fake.api, state, async () => {}), /cleaned up/);
});

test('cleanup refuses a shift whose ownership has changed', async () => {
  const fake = fakeSquare(), state = plan();
  await preflight(fake.api, state); await seed(fake.api, state, async () => {});
  fake.shifts.get(state.shifts[0].id).draft_shift_details.team_member_id = 'REAL_PERSON';
  const count = fake.calls.length;
  await assert.rejects(cleanup(fake.api, state, async () => {}), /ownership/);
  assert.ok(fake.calls.slice(count).every(c => c.method === 'GET'));
});

test('cleanup resumes after Square hard-deletes a shift but the response is lost', async () => {
  const fake = fakeSquare(), state = plan();
  await preflight(fake.api, state); await seed(fake.api, state, async () => {});
  let lost = true;
  const api = async (...args) => {
    const response = await fake.api(...args);
    if (args[0].endsWith('/publish') && lost) { lost = false; throw new Error('Deletion response lost'); }
    return response;
  };
  await assert.rejects(cleanup(api, state, async () => {}), /Deletion response lost/);
  await cleanup(api, state, async () => {});
  assert.equal(fake.shifts.size, 0);
  assert.ok(state.shifts.every(s => s.cleaned));
});

test('verification exercises the actual app reader and calendar renderer, and catches a missing published shift', async () => {
  const fake = fakeSquare(), state = plan();
  await preflight(fake.api, state); await seed(fake.api, state, async () => {});
  const originalFetch = globalThis.fetch, originalEnvironment = process.env.SQUARE_ENVIRONMENT;
  const out = await mkdtemp(join(tmpdir(), 'calendar-seed-check-'));
  let omitShift = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).origin, ORIGIN);
    const path = new URL(url).pathname;
    let data;
    if (path === '/v2/locations') data = { locations: [fake.location] };
    else if (path === '/v2/team-members/jobs') data = { jobs: Object.values(state.jobs) };
    else if (path === '/v2/team-members/search') data = { team_members: [...fake.members.values()] };
    else if (path === '/v2/labor/scheduled-shifts/search') {
      const body = JSON.parse(init.body), filter = body.query.filter;
      assert.equal(filter.assignment_status, 'ASSIGNED');
      assert.deepEqual(filter.scheduled_shift_statuses, ['PUBLISHED']);
      const rows = [...fake.shifts.values()].filter(s => s.published_shift_details && !s.published_shift_details.is_deleted && (!filter.team_member_ids || filter.team_member_ids.includes(s.published_shift_details.team_member_id)));
      data = { scheduled_shifts: omitShift ? rows.slice(1) : rows };
    } else throw new Error(`Unexpected request: ${path}`);
    return { ok: true, json: async () => structuredClone(data) };
  };
  try {
    const report = await verify(state, 'fake-sandbox-token', out);
    assert.deepEqual(report.results.map(r => r.events), [3, 3]);
    const calendar = await readFile(join(out, 'alex.ics'), 'utf8');
    assert.match(calendar, /BEGIN:VCALENDAR/);
    assert.doesNotMatch(calendar, new RegExp(state.shifts.at(-1).id));
    omitShift = true;
    await assert.rejects(verify(state, 'fake-sandbox-token', out), /Published assigned shifts must match/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.SQUARE_ENVIRONMENT; else process.env.SQUARE_ENVIRONMENT = originalEnvironment;
    await rm(out, { recursive: true });
  }
});
