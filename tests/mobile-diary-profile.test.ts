import test from 'node:test';
import assert from 'node:assert/strict';
import { diaryAction } from '../server/mobile-app/diary.ts';
import { boundedPhotoBody, validProfilePhoto } from '../server/mobile-app/profile-photo.ts';
import { mobileAppErrorResponse } from '../server/mobile-app/http.ts';
import { GET as diaryGet, POST as diaryPost } from '../app/api/v1/mobile/diary/route.ts';
import { GET as photoGet, PUT as photoPut } from '../app/api/v1/mobile/profile-photo/route.ts';
import { GET as lessonGet, POST as lessonPost } from '../app/api/v1/mobile/lesson-attendance/route.ts';
import { GET as teachingGet, POST as teachingPost } from '../app/api/v1/mobile/teaching-context/route.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const homework = { action: 'create', id, assignmentId: id, title: 'Fractions', description: 'Complete exercises 1–5', date: '2026-09-07', dueDate: '2026-09-08' };
test('diary validates real dates, due dates and bounded instructions', () => {
  assert.equal(diaryAction.safeParse(homework).success, true);
  for (const change of [{dueDate:'2026-09-06'}, {date:'2026-02-30'}, {description:'x'.repeat(4001)}, {tenantId:id}, {assignmentId:'teacher'}]) {
    assert.equal(diaryAction.safeParse({...homework,...change}).success,false);
  }
  assert.equal(diaryAction.safeParse({action:'complete',diaryId:id,studentId:id,completed:true}).success,true);
  assert.equal(diaryAction.safeParse({action:'complete',diaryId:id,studentId:id,completed:'yes'}).success,false);
});
test('profile photos reject URLs, SVG, mismatched bytes and oversized bodies', async () => {
  assert.equal(validProfilePhoto(null), true);
  for (const photo of [undefined, 'https://example.com/avatar.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'x'.repeat(400001)]) {
    assert.equal(validProfilePhoto(photo), false);
  }
  assert.deepEqual(await boundedPhotoBody(new Request('https://example.invalid', {method:'PUT',body:'{"photo":null}'})),{photo:null});
  await assert.rejects(boundedPhotoBody(new Request('https://example.invalid', {method:'PUT',body:'x'.repeat(400101)})),RangeError);
  await assert.rejects(boundedPhotoBody(new Request('https://example.invalid', {method:'PUT',body:'bad json'})),SyntaxError);
});
test('mobile errors do not expose internal database details', async () => {
  assert.equal(mobileAppErrorResponse(new Error('Authentication required'),'Unavailable').status,401);
  assert.equal(mobileAppErrorResponse(new SyntaxError('private payload'),'Unavailable').status,400);
  const response=mobileAppErrorResponse(new Error('database password internal'),'Unavailable');
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'Unavailable'});
});
test('new mobile endpoints reject anonymous access before reading or writing data', async () => {
  for (const [method, handler] of [['GET',diaryGet],['POST',diaryPost],['GET',photoGet],['PUT',photoPut],['GET',lessonGet],['POST',lessonPost],['GET',teachingGet],['POST',teachingPost]] as const) {
    const response=await handler(new Request('https://example.invalid/api/v1/mobile/test',{method}));
    assert.equal(response.status,401,`${method} ${handler.name}`);
  }
});
