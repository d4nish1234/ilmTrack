/**
 * The admin's schedule writes (timekeeping.service) against the Firestore
 * emulator and the real rules, as an org admin. Focused on how they treat
 * shifts a schedule template wrote: editing one makes that day the admin's
 * own, and deleting one is remembered so the template doesn't re-add it.
 *
 * Needs the Firestore emulator on 127.0.0.1:8080.
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shift } from '../src/types';

const holder = vi.hoisted(() => ({ firestore: null as unknown }));
vi.mock('../src/config/firebase', () => ({
  get firestore() {
    return holder.firestore;
  },
  functions: {},
}));

// Imported once the emulator client exists: the service builds its collection
// references when it loads.
let svc: typeof import('../src/services/timekeeping.service');

const ORG = 'org1';
const ADMIN = 'admin1';
const TEACHER = 'teacher1';
const WEEK = '2026-11-16';
const NEXT = '2026-11-23';
let testEnv: RulesTestEnvironment;

const tplShift = (date: string): Shift => ({
  id: `tpl-a-${date}`, date, start: '16:00', end: '18:00', locationId: 'loc1', templateId: 'tpl',
});
const weekRef = (weekStart = WEEK) => doc(holder.firestore as never, 'schedules', `${ORG}_${TEACHER}_${weekStart}`);
const week = async (weekStart = WEEK) => (await getDoc(weekRef(weekStart))).data();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'ilmtrack-timekeeping-service-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  holder.firestore = testEnv.authenticatedContext(ADMIN).firestore();
  svc = await import('../src/services/timekeeping.service');
});

afterAll(() => testEnv.cleanup());

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizations', ORG), { name: 'Test School', memberUserIds: [ADMIN] });
    await setDoc(doc(db, 'schedules', `${ORG}_${TEACHER}_${WEEK}`), {
      orgId: ORG, teacherId: TEACHER, weekStart: WEEK,
      shifts: [tplShift('2026-11-16'), tplShift('2026-11-17')],
    });
  });
});

describe("editing a template's shift by hand", () => {
  it("makes that day the admin's own: the template's tag is dropped, the id kept", async () => {
    await svc.saveShift(ORG, TEACHER, WEEK, { ...tplShift('2026-11-16'), start: '16:30' }, ADMIN);
    const [edited, untouched] = (await week())!.shifts;
    expect(edited).toEqual({ id: 'tpl-a-2026-11-16', date: '2026-11-16', start: '16:30', end: '18:00', locationId: 'loc1' });
    expect(untouched.templateId).toBe('tpl');
  });

  it('remembers the day as no longer the template’s, so deleting it later keeps it deleted', async () => {
    await svc.saveShift(ORG, TEACHER, WEEK, { ...tplShift('2026-11-16'), start: '16:30' }, ADMIN);
    expect((await week())!.skippedTemplateShifts).toEqual(['tpl-a-2026-11-16']);
    await svc.deleteShift(ORG, TEACHER, WEEK, 'tpl-a-2026-11-16', ADMIN);
    const w = (await week())!;
    expect(w.shifts.map((s: Shift) => s.id)).toEqual(['tpl-a-2026-11-17']);
    expect(w.skippedTemplateShifts).toEqual(['tpl-a-2026-11-16']);
  });
});

describe("deleting a template's shift for one day", () => {
  it('is remembered, so applying the template again leaves it deleted', async () => {
    await svc.deleteShift(ORG, TEACHER, WEEK, 'tpl-a-2026-11-16', ADMIN);
    const w = (await week())!;
    expect(w.shifts.map((s: Shift) => s.id)).toEqual(['tpl-a-2026-11-17']);
    expect(w.skippedTemplateShifts).toEqual(['tpl-a-2026-11-16']);
  });

  it("isn't recorded for a shift added by hand", async () => {
    await svc.saveShift(ORG, TEACHER, WEEK, { id: 'mine', date: '2026-11-18', start: '09:00', end: '10:00', locationId: 'loc1' }, ADMIN);
    await svc.deleteShift(ORG, TEACHER, WEEK, 'mine', ADMIN);
    expect((await week())!.skippedTemplateShifts).toBeUndefined();
  });

  it('survives later edits to the week', async () => {
    await svc.deleteShift(ORG, TEACHER, WEEK, 'tpl-a-2026-11-16', ADMIN);
    await svc.saveShift(ORG, TEACHER, WEEK, { ...tplShift('2026-11-17'), end: '17:00' }, ADMIN);
    // The edited day joins it (see above).
    expect((await week())!.skippedTemplateShifts).toEqual(['tpl-a-2026-11-16', 'tpl-a-2026-11-17']);
  });
});

describe('copying a week', () => {
  it("copies template shifts as the admin's own, and keeps the next week's day-only deletions", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'schedules', `${ORG}_${TEACHER}_${NEXT}`), {
        orgId: ORG, teacherId: TEACHER, weekStart: NEXT, shifts: [], skippedTemplateShifts: ['tpl-a-2026-11-24'],
      });
    });
    await svc.copyWeek(ORG, TEACHER, WEEK, NEXT, await svc.inspectWeek(ORG, TEACHER, NEXT), ADMIN);
    const next = (await week(NEXT))!;
    expect(next.shifts.map((s: Shift) => s.date)).toEqual(['2026-11-23', '2026-11-24']);
    expect(next.shifts.every((s: Shift) => !('templateId' in s))).toBe(true);
    expect(next.skippedTemplateShifts).toEqual(['tpl-a-2026-11-24']);
  });
});
