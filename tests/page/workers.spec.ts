/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test as it, expect } from './pageTest';
import { attachFrame } from '../config/utils';
import type { ConsoleMessage } from 'playwright-core';

it('Page.workers @smoke', async function({ page, server }) {
  await Promise.all([
    page.waitForEvent('worker'),
    page.goto(server.PREFIX + '/worker/worker.html')]);
  const worker = page.workers()[0];
  expect(worker.url()).toContain('worker.js');

  expect(await worker.evaluate(() => self['workerFunction']())).toBe('worker function result');

  await page.goto(server.EMPTY_PAGE);
  expect(page.workers().length).toBe(0);
});

it('should emit created and destroyed events', async function({ page }) {
  const workerCreatedPromise = page.waitForEvent('worker');
  const workerObj = await page.evaluateHandle(() => new Worker(URL.createObjectURL(new Blob(['1'], { type: 'application/javascript' }))));
  const worker = await workerCreatedPromise;
  const workerThisObj = await worker.evaluateHandle(() => this);
  const workerDestroyedPromise = new Promise(x => worker.once('close', x));
  await page.evaluate(workerObj => workerObj.terminate(), workerObj);
  expect(await workerDestroyedPromise).toBe(worker);
  const error = await workerThisObj.getProperty('self').catch(error => error);
  expect(error.message).toMatch(/jsHandle.getProperty: (Worker was closed|Target closed)/);
});

it('should report console logs', async function({ page }) {
  const [message] = await Promise.all([
    page.waitForEvent('console'),
    page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['console.log(1)'], { type: 'application/javascript' })))),
  ]);
  expect(message.text()).toBe('1');
  // Firefox's juggler had an issue that reported worker blob urls as frame urls.
  expect(page.url()).not.toContain('blob');
});

it('should not report console logs from workers twice', async function({ page }) {
  const messages = [];
  page.on('console', msg => messages.push(msg.text()));
  await Promise.all([
    page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['console.log(1); console.log(2);'], { type: 'application/javascript' })))),
    page.waitForEvent('console', msg => msg.text() === '1'),
    page.waitForEvent('console', msg => msg.text() === '2'),
  ]);
  expect(messages).toEqual(['1', '2']);
  // Firefox's juggler had an issue that reported worker blob urls as frame urls.
  expect(page.url()).not.toContain('blob');
});

it('should have JSHandles for console logs', async function({ page, browserName }) {
  const logPromise = new Promise<ConsoleMessage>(x => page.on('console', x));
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['console.log(1,2,3,this)'], { type: 'application/javascript' }))));
  const log = await logPromise;
  if (browserName !== 'firefox')
    expect(log.text()).toBe('1 2 3 DedicatedWorkerGlobalScope');
  else
    expect(log.text()).toBe('1 2 3 JSHandle@object');
  expect(log.args().length).toBe(4);
  expect(await (await log.args()[3].getProperty('origin')).jsonValue()).toBe('null');
});

it('should evaluate', async function({ page }) {
  const workerCreatedPromise = page.waitForEvent('worker');
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['console.log(1)'], { type: 'application/javascript' }))));
  const worker = await workerCreatedPromise;
  expect(await worker.evaluate('1+1')).toBe(2);
});

it('should report errors', async function({ page }) {
  const errorPromise = new Promise<Error>(x => page.on('pageerror', x));
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob([`
    setTimeout(() => {
      // Do a console.log just to check that we do not confuse it with an error.
      console.log('hey');
      throw new Error('this is my error');
    })
  `], { type: 'application/javascript' }))));
  const errorLog = await errorPromise;
  expect(errorLog.message).toContain('this is my error');
});

it('should clear upon navigation', async function({ server, page }) {
  await page.goto(server.EMPTY_PAGE);
  const workerCreatedPromise = page.waitForEvent('worker');
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['console.log(1)'], { type: 'application/javascript' }))));
  const worker = await workerCreatedPromise;
  expect(page.workers().length).toBe(1);
  let destroyed = false;
  worker.once('close', () => destroyed = true);
  await page.goto(server.PREFIX + '/one-style.html');
  expect(destroyed).toBe(true);
  expect(page.workers().length).toBe(0);
});

it('should clear upon cross-process navigation', async function({ server, page }) {
  await page.goto(server.EMPTY_PAGE);
  const workerCreatedPromise = page.waitForEvent('worker');
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['console.log(1)'], { type: 'application/javascript' }))));
  const worker = await workerCreatedPromise;
  expect(page.workers().length).toBe(1);
  let destroyed = false;
  worker.once('close', () => destroyed = true);
  await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
  expect(destroyed).toBe(true);
  expect(page.workers().length).toBe(0);
});

it('should attribute network activity for worker inside iframe to the iframe', async function({ page, server, browserName }) {
  it.fixme(browserName === 'firefox' || browserName === 'chromium');

  await page.goto(server.PREFIX + '/empty.html');
  const [worker, frame] = await Promise.all([
    page.waitForEvent('worker'),
    attachFrame(page, 'frame1', server.PREFIX + '/worker/worker.html'),
  ]);
  const url = server.PREFIX + '/one-style.css';
  const [request] = await Promise.all([
    page.waitForRequest(url),
    worker.evaluate(url => fetch(url).then(response => response.text()).then(console.log), url),
  ]);
  expect(request.url()).toBe(url);
  expect(request.frame()).toBe(frame);
});

it('should report network activity', async function({ page, server }) {
  const [worker] = await Promise.all([
    page.waitForEvent('worker'),
    page.goto(server.PREFIX + '/worker/worker.html'),
  ]);
  const url = server.PREFIX + '/one-style.css';
  const requestPromise = page.waitForRequest(url);
  const responsePromise = page.waitForResponse(url);
  await worker.evaluate(url => fetch(url).then(response => response.text()).then(console.log), url);
  const request = await requestPromise;
  const response = await responsePromise;
  expect(request.url()).toBe(url);
  expect(response.request()).toBe(request);
  expect(response.ok()).toBe(true);
});

it('should report network activity on worker creation', async function({ page, server }) {
  // Chromium needs waitForDebugger enabled for this one.
  await page.goto(server.EMPTY_PAGE);
  const url = server.PREFIX + '/one-style.css';
  const requestPromise = page.waitForRequest(url);
  const responsePromise = page.waitForResponse(url);
  await page.evaluate(url => new Worker(URL.createObjectURL(new Blob([`
    fetch("${url}").then(response => response.text()).then(console.log);
  `], { type: 'application/javascript' }))), url);
  const request = await requestPromise;
  const response = await responsePromise;
  expect(request.url()).toBe(url);
  expect(response.request()).toBe(request);
  expect(response.ok()).toBe(true);
});

it('should dispatch console messages when page has workers', async function({ page, browserName, server }) {
  it.info().annotations.push({ type: 'issue', description: 'https://github.com/microsoft/playwright/issues/15550' });
  it.fixme(browserName === 'firefox');
  await page.goto(server.EMPTY_PAGE);
  await Promise.all([
    page.waitForEvent('worker'),
    page.evaluate(() => new Worker(URL.createObjectURL(new Blob(['const x = 1;'], { type: 'application/javascript' }))))
  ]);
  const [message] = await Promise.all([
    page.waitForEvent('console'),
    page.evaluate(() => console.log('foo'))
  ]);
  expect(message.text()).toBe('foo');
});
