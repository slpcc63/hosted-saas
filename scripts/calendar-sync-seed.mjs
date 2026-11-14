#!/usr/bin/env node
// Standalone Sandbox tool. Never loads the application's database or notification code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const ORIGIN = 'https://connect.squareupsandbox.com';
const VERSION = '2026-01-22'; // Match lib/square.ts.
const PREFIX = 'CALENDAR-SYNC-TEST';
const hash = value => createHash('sha256').update(value).digest('hex');
const key = (state, operation) => hash(`${state.tag}:${operation}`).slice(0, 40);
const check = (value, message) => { if (!value) throw new Error(message); };

export function makePlan({ run, date, days = 3 }) {
  check(/^[a-z0-9][a-z0-9-]{0,39}$/.test(run ?? ''), '--run must contain 1–40 lowercase letters, numbers, or hyphens.');
  check(/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date, '--date must be a real YYYY-MM-DD date.');
  check(Number.isInteger(days) && days >= 1 && days <= 14, '--days must be an integer from 1 to 14.');
  const shifts = [];
  for (let day = 0; day < days; day++) {
    const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + day);
    for (const [person, start, end] of [['Alex', 9, 13], ['Casey', 10, 14]]) {
      shifts.push({ label: `${day + 1}-${person}`, person, date: d.toISOString().slice(0, 10), start, end, publish: true });
    }
  }
  shifts.push({ label: 'draft-control', person: 'Alex', date, start: 16, end: 17, publish: false });
  return { schema: 1, environment: 'sandbox', run, date, days, tag: `${PREFIX}:${run}:${date}`, shifts };
}

export function localTimestamp(date, hour, timezone) {
  // Convert an unambiguous daytime wall-clock time to its location's offset.
  const wall = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = time => Object.fromEntries(fmt.formatToParts(new Date(time)).map(p => [p.type, p.value]));
  const asUTC = p => Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  let instant = wall;
  for (let i = 0; i < 3; i++) instant += wall - asUTC(parts(instant));
  check(asUTC(parts(instant)) === wall, `Cannot resolve local time in ${timezone}.`);
  const offset = Math.round((wall - instant) / 60000);
  return `${date}T${String(hour).padStart(2, '0')}:00:00${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
}

export function sandboxClient(token, fetcher = fetch) {
  check(token?.trim(), 'Missing SQUARE_SANDBOX_ACCESS_TOKEN. Save it in .env.calendar-sync.local; never use a production token.');
  return async (path, body, method = body ? 'POST' : 'GET') => {
    check(/^\/v2\/(locations(?:\/[^/?]+)?|team-members(?:\/[^?]*)?|labor\/scheduled-shifts(?:\/[^?]*)?)(?:\?.*)?$/.test(path), 'Only Sandbox location, test-team, and scheduled-shift endpoints are allowed.');
    const response = await fetcher(`${ORIGIN}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json', 'Square-Version': VERSION },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok || data.errors?.length) {
      // Error codes are enough to diagnose without logging credentials or API payloads.
      const error = new Error(`Square Sandbox ${method} ${path.split('?')[0]}: HTTP ${response.status}; ${(data.errors ?? []).map(e => e.code).join(', ') || 'request failed'}`);
      error.status = response.status;
      throw error;
    }
    return data;
  };
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export async function preflight(api, state, requestedLocation) {
  check(state.environment === 'sandbox' && state.schema === 1 && state.tag === `${PREFIX}:${state.run}:${state.date}`, 'Invalid or non-Sandbox manifest.');
  const locations = (await api('/v2/locations')).locations?.filter(l => l.status === 'ACTIVE') ?? [];
  const target = requestedLocation || state.location?.id;
  check(target || locations.length === 1, 'Choose an active Sandbox location with --location ID.');
  const location = locations.find(l => target ? l.id === target : true);
  check(location?.id && location.timezone && location.merchant_id, 'An active Sandbox location with timezone and merchant ID is required.');
  if (state.location) {
    check(location.id === state.location.id && location.merchant_id === state.location.merchant_id && location.timezone === state.location.timezone, 'Manifest belongs to a different location, merchant, or timezone.');
  } else {
    state.location = { id: location.id, name: location.name, merchant_id: location.merchant_id, timezone: location.timezone, currency: location.currency ?? 'USD' };
  }
}

function ownShift(state, entry, shift) {
  check(shift?.id === entry.id, 'Square returned a different shift ID.');
  const d = shift.draft_shift_details;
  check(d?.notes === `${state.tag}:${entry.label}` && d.location_id === state.location.id && d.team_member_id === state.members[entry.person].id && d.job_id === state.jobs[entry.person].id, 'Refusing to change a shift whose test ownership does not match the manifest.');
}

async function publish(api, state, entry, shift, operation) {
  return (await api(`/v2/labor/scheduled-shifts/${encodeURIComponent(entry.id)}/publish`, {
    idempotency_key: key(state, `${operation}:${entry.label}:${shift.version}`), version: shift.version,
    scheduled_shift_notification_audience: 'NONE'
  })).scheduled_shift;
}

export async function seed(api, state, persist) {
  check(!state.cleanedAt, 'This run was cleaned up. Choose a new --run for a new demo.');
  state.jobs ??= {}; state.members ??= {}; state.jobAssignments ??= {};
  await persist();
  for (const [person, role] of [['Alex', 'Barista'], ['Casey', 'Lead']]) {
    if (!state.jobs[person]) {
      const response = await api('/v2/team-members/jobs', { idempotency_key: key(state, `job:${person}`), job: { title: `${PREFIX} ${state.run} ${role}`, is_tip_eligible: false } });
      check(response.job?.id, 'Square did not return a job ID.');
      state.jobs[person] = response.job; await persist();
    }
    if (!state.members[person]) {
      const response = await api('/v2/team-members', { idempotency_key: key(state, `member-profile:${person}`), team_member: {
        reference_id: `${state.tag}:${person}`, status: 'ACTIVE', given_name: person, family_name: `Test ${state.run}`,
        assigned_locations: { assignment_type: 'EXPLICIT_LOCATIONS', location_ids: [state.location.id] }
      } });
      check(response.team_member?.id, 'Square did not return a team member ID.');
      state.members[person] = response.team_member; await persist();
    }
    if (!state.jobAssignments[person]) {
      const memberPath = `/v2/team-members/${encodeURIComponent(state.members[person].id)}`;
      const member = (await api(memberPath)).team_member;
      check(member?.reference_id === `${state.tag}:${person}` && !member.email_address && !member.phone_number, 'Refusing to assign a job to a modified or non-test employee.');
      let wage;
      try { wage = (await api(`${memberPath}/wage-setting`)).wage_setting; }
      catch (error) { if (error.status !== 404) throw error; }
      if (!(wage?.job_assignments ?? []).some(job => job.job_id === state.jobs[person].id)) {
        check(!wage?.job_assignments?.length, 'Unexpected existing job assignment; review the test employee before resuming.');
        const response = await api(`${memberPath}/wage-setting`, { wage_setting: {
          ...(wage?.version === undefined ? {} : { version: wage.version }), is_overtime_exempt: false,
          job_assignments: [{ job_id: state.jobs[person].id, pay_type: 'HOURLY', hourly_rate: { amount: 2000, currency: state.location.currency } }]
        } }, 'PUT');
        check(response.wage_setting?.job_assignments?.some(job => job.job_id === state.jobs[person].id), 'Square did not confirm the test job assignment.');
      }
      state.jobAssignments[person] = state.jobs[person].id; await persist();
    }
  }
  for (const entry of state.shifts) {
    let shift;
    if (!entry.id) {
      const response = await api('/v2/labor/scheduled-shifts', { idempotency_key: key(state, `shift:${entry.label}`), scheduled_shift: { draft_shift_details: {
        location_id: state.location.id, job_id: state.jobs[entry.person].id, team_member_id: state.members[entry.person].id,
        start_at: localTimestamp(entry.date, entry.start, state.location.timezone), end_at: localTimestamp(entry.date, entry.end, state.location.timezone),
        notes: `${state.tag}:${entry.label}`
      } } });
      shift = response.scheduled_shift;
      check(shift?.id, 'Square did not return a scheduled shift ID.');
      entry.id = shift.id; await persist();
    } else shift = (await api(`/v2/labor/scheduled-shifts/${encodeURIComponent(entry.id)}`)).scheduled_shift;
    ownShift(state, entry, shift);
    check(!shift.draft_shift_details.is_deleted, 'A seeded shift has been deleted. Use a new run.');
    if (entry.publish && !shift.published_shift_details) shift = await publish(api, state, entry, shift, 'publish');
    entry.version = shift.version; entry.published = !!shift.published_shift_details;
    await persist();
  }
  state.seededAt = new Date().toISOString(); await persist();
  return { published: state.shifts.filter(s => s.published).length, drafts: state.shifts.filter(s => !s.published).length };
}

export async function cleanup(api, state, persist) {
  const retrieve = async entry => {
    try { return (await api(`/v2/labor/scheduled-shifts/${encodeURIComponent(entry.id)}`)).scheduled_shift; }
    catch (error) { if (error.status === 404) return null; throw error; }
  };
  for (const entry of state.shifts) {
    if (!entry.id || entry.cleaned) continue;
    let shift = await retrieve(entry);
    // Square hard-deletes shifts. A lost deletion response is safely resumable.
    if (!shift) { entry.cleaned = true; await persist(); continue; }
    ownShift(state, entry, shift);
    if (!shift.draft_shift_details.is_deleted) {
      shift = (await api(`/v2/labor/scheduled-shifts/${encodeURIComponent(entry.id)}`, { scheduled_shift: {
        id: entry.id, version: shift.version, draft_shift_details: { is_deleted: true }
      } }, 'PUT')).scheduled_shift;
    }
    if (shift?.published_shift_details && !shift.published_shift_details.is_deleted) await publish(api, state, entry, shift, 'cleanup');
    check(await retrieve(entry) === null, 'Square has not confirmed shift deletion.');
    entry.cleaned = true; await persist();
  }
  // Square has no team-member delete endpoint. Deactivate only this run's synthetic people.
  for (const person of Object.keys(state.members ?? {})) {
    const member = state.members[person];
    const current = (await api(`/v2/team-members/${encodeURIComponent(member.id)}`)).team_member;
    check(current?.reference_id === `${state.tag}:${person}` && !current.email_address && !current.phone_number, 'Refusing to deactivate a modified or non-test team member.');
    if (current.status !== 'INACTIVE') await api(`/v2/team-members/${encodeURIComponent(member.id)}`, { team_member: { status: 'INACTIVE' } }, 'PUT');
  }
  state.cleanedAt = new Date().toISOString(); await persist();
}

export async function verify(state, token, outputDirectory) {
  check(state.seededAt && !state.cleanedAt, 'Seed this run before verifying it.');
  // Narrow CLI-only resolver: run the actual application Square reader without Next.js.
  const { registerHooks } = await import('node:module');
  const squareURL = pathToFileURL(await realpath(new URL('../lib/square.ts', import.meta.url))).href;
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL === squareURL && specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (context.parentURL === squareURL && specifier === '@/lib/square-pagination') return { url: new URL('../lib/square-pagination.ts', import.meta.url).href, shortCircuit: true };
    if (context.parentURL === squareURL && specifier === '@/lib/square-disconnect') return { url: new URL('../lib/square-disconnect.ts', import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  } });
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  let square;
  try { square = await import(squareURL); } finally { hook.deregister(); }
  const { buildSquareShiftCalendar } = await import('../lib/icalendar.ts');
  check(square.getSquareBaseUrl() === ORIGIN, 'Application reader must target Sandbox.');
  const first = new Date(localTimestamp(state.date, 0, state.location.timezone));
  const lastDate = state.shifts.filter(s => s.publish).at(-1).date;
  const end = new Date(Date.parse(localTimestamp(lastDate, 23, state.location.timezone)) + 3600000);
  const [jobs, locations, teamMembers, coworkerShifts] = await Promise.all([
    square.listSquareJobs(token), square.listSquareLocations(token), square.searchSquareTeamMembers(token),
    square.searchSquareScheduledShifts({ accessToken: token, locationIds: [state.location.id], startAt: first, endAt: end })
  ]);
  await mkdir(outputDirectory, { recursive: true });
  const results = [];
  for (const person of ['Alex', 'Casey']) {
    const memberId = state.members[person].id;
    const shifts = await square.searchSquareScheduledShifts({ accessToken: token, teamMemberIds: [memberId], startAt: first, endAt: end });
    const expected = state.shifts.filter(s => s.person === person && s.publish);
    assert.deepEqual(shifts.map(s => s.id).sort(), expected.map(s => s.id).sort(), 'Published assigned shifts must match the seeded schedule exactly; drafts must be absent.');
    for (const entry of expected) {
      const d = shifts.find(s => s.id === entry.id).published_shift_details;
      assert.equal(Date.parse(d.start_at), Date.parse(localTimestamp(entry.date, entry.start, state.location.timezone)));
      assert.equal(Date.parse(d.end_at), Date.parse(localTimestamp(entry.date, entry.end, state.location.timezone)));
      assert.equal(d.job_id, state.jobs[person].id);
      assert.equal(d.location_id, state.location.id);
    }
    const input = { calendarName: `${PREFIX} ${state.run} ${person}`, shifts, coworkerShifts, jobs, locations, teamMembers };
    const calendar = buildSquareShiftCalendar(input);
    const unfolded = calendar.body.replaceAll('\r\n ', '');
    assert.equal((unfolded.match(/BEGIN:VEVENT/g) ?? []).length, expected.length);
    assert.equal(new Set(unfolded.match(/^UID:.*$/gm)).size, expected.length);
    for (const entry of expected) assert.ok(unfolded.includes(`UID:${entry.id}-${memberId}@square-calendar-sync.slpcc63.com`));
    assert.equal(buildSquareShiftCalendar(input).etag, calendar.etag);
    assert.match(unfolded, new RegExp(`with ${person === 'Alex' ? 'Casey' : 'Alex'} Test`));
    assert.ok(unfolded.includes(`shift as ${state.jobs[person].title}`));
    assert.ok(unfolded.includes(`(${state.jobs[person === 'Alex' ? 'Casey' : 'Alex'].title})`));
    await writeFile(resolve(outputDirectory, `${person.toLowerCase()}.ics`), calendar.body);
    results.push({ employee: person, events: expected.length, etag: calendar.etag });
  }
  const report = { verifiedAt: new Date().toISOString(), environment: 'sandbox', run: state.run, results,
    checks: ['Square published/assigned search', 'draft exclusion', 'employee isolation', 'exact start/end times, job and location', 'unique stable event UIDs', 'coworker names and roles', 'stable ETags'],
    sourceHashes: Object.fromEntries(await Promise.all(['square.ts', 'square-pagination.ts', 'icalendar.ts'].map(async name => [name, hash(await readFile(new URL(`../lib/${name}`, import.meta.url)))]))),
    notCovered: ['Hosted database and feed-token route', 'Subscribed calendar refresh', 'Live pilot'] };
  await writeFile(resolve(outputDirectory, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    run: { type: 'string' }, date: { type: 'string' }, days: { type: 'string' }, location: { type: 'string' },
    state: { type: 'string' }, help: { type: 'boolean' }
  } });
  const command = positionals[0];
  if (values.help || !command) {
    console.log('Usage: node --experimental-transform-types --env-file-if-exists=.env.calendar-sync.local scripts/calendar-sync-seed.mjs <plan|seed|verify|cleanup> --run NAME [--date YYYY-MM-DD] [--days 1..14] [--location SANDBOX_ID]\nSandbox only. plan is offline. seed creates two synthetic people, two jobs, published shifts and one draft control. cleanup deletes only recorded test shifts and deactivates test people; jobs remain. Keep the manifest in .calendar-sync-seeds/.'); return;
  }
  check(['plan', 'seed', 'verify', 'cleanup'].includes(command) && positionals.length === 1, 'Unknown command. Use --help.');
  check(/^[a-z0-9][a-z0-9-]{0,39}$/.test(values.run ?? ''), 'A valid --run NAME is required.');
  const statePath = resolve(values.state ?? `.calendar-sync-seeds/${values.run}.json`);
  let state;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (state) {
    check(state.run === values.run, 'Manifest run does not match --run.');
    check(!values.date || values.date === state.date, 'Existing run has a different date; choose a new --run.');
    check(!values.days || Number(values.days) === state.days, 'Existing run has a different duration; choose a new --run.');
  } else {
    check(command === 'plan' || command === 'seed', 'No saved manifest. Run seed first.');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    state = makePlan({ run: values.run, date: values.date ?? tomorrow, days: values.days === undefined ? 3 : Number(values.days) });
  }
  if (command === 'plan') { console.log(JSON.stringify(state, null, 2)); return; }
  // Prevent simultaneous seed/cleanup processes for a run; retain the manifest for resumption.
  await mkdir(dirname(statePath), { recursive: true });
  const { open, unlink } = await import('node:fs/promises');
  const lock = await open(`${statePath}.lock`, 'wx').catch(e => { if (e.code === 'EEXIST') throw new Error(`Run is locked. Confirm no other seed process is running before removing ${statePath}.lock.`); throw e; });
  try {
    await lock.writeFile(String(process.pid));
    // Another process may have finished between our initial read and lock acquisition.
    try {
      const latest = JSON.parse(await readFile(statePath, 'utf8'));
      check(latest.run === state.run && latest.date === state.date && latest.days === state.days, 'Manifest changed while acquiring the run lock. Retry with matching options.');
      state = latest;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
    const api = sandboxClient(token);
    await preflight(api, state, values.location);
    const persist = () => saveState(statePath, state);
    if (command === 'seed') console.log(JSON.stringify({ ...(await seed(api, state, persist)), manifest: statePath }));
    if (command === 'verify') console.log(JSON.stringify(await verify(state, token, resolve(dirname(statePath), `${state.run}-calendar`)), null, 2));
    if (command === 'cleanup') { await cleanup(api, state, persist); console.log(`Cleaned test shifts and deactivated test people. Test jobs retained. Manifest: ${statePath}`); }
  } finally { await lock.close(); await unlink(`${statePath}.lock`); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
