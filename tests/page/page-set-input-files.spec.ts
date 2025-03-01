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

import path from 'path';
import fs from 'fs';
import os from 'os';
import formidable from 'formidable';

it('should upload the file', async ({ page, server, asset }) => {
  await page.goto(server.PREFIX + '/input/fileupload.html');
  const filePath = path.relative(process.cwd(), asset('file-to-upload.txt'));
  const input = await page.$('input');
  await input.setInputFiles(filePath);
  expect(await page.evaluate(e => e.files[0].name, input)).toBe('file-to-upload.txt');
  expect(await page.evaluate(e => {
    const reader = new FileReader();
    const promise = new Promise(fulfill => reader.onload = fulfill);
    reader.readAsText(e.files[0]);
    return promise.then(() => reader.result);
  }, input)).toBe('contents of the file');
});

it('should upload large file', async ({ page, server, browserName, isMac, isAndroid }, testInfo) => {
  it.skip(browserName === 'webkit' && isMac && parseInt(os.release(), 10) < 20, 'WebKit for macOS 10.15 is frozen and does not have corresponding protocol features.');
  it.skip(isAndroid);
  it.slow();
  await page.goto(server.PREFIX + '/input/fileupload.html');
  const uploadFile = testInfo.outputPath('200MB.zip');
  const str = 'A'.repeat(4 * 1024);
  const stream = fs.createWriteStream(uploadFile);
  for (let i = 0; i < 50 * 1024; i++) {
    await new Promise<void>((fulfill, reject) => {
      stream.write(str, err => {
        if (err)
          reject(err);
        else
          fulfill();
      });
    });
  }
  await new Promise(f => stream.end(f));
  const input = page.locator('input[type="file"]');
  const events = await input.evaluateHandle(e => {
    const events = [];
    e.addEventListener('input', () => events.push('input'));
    e.addEventListener('change', () => events.push('change'));
    return events;
  });
  await input.setInputFiles(uploadFile);
  expect(await input.evaluate(e => (e as HTMLInputElement).files[0].name)).toBe('200MB.zip');
  expect(await events.evaluate(e => e)).toEqual(['input', 'change']);
  const serverFilePromise = new Promise<formidable.File>(fulfill => {
    server.setRoute('/upload', async (req, res) => {
      const form = new formidable.IncomingForm({ uploadDir: testInfo.outputPath() });
      form.parse(req, function(err, fields, f) {
        res.end();
        const files = f as Record<string, formidable.File>;
        fulfill(files.file1);
      });
    });
  });
  const [file1] = await Promise.all([
    serverFilePromise,
    page.click('input[type=submit]')
  ]);
  expect(file1.originalFilename).toBe('200MB.zip');
  expect(file1.size).toBe(200 * 1024 * 1024);
  await Promise.all([uploadFile, file1.filepath].map(fs.promises.unlink));
});

it('should upload large file with relative path', async ({ page, server, browserName, isMac, isAndroid }, testInfo) => {
  it.skip(browserName === 'webkit' && isMac && parseInt(os.release(), 10) < 20, 'WebKit for macOS 10.15 is frozen and does not have corresponding protocol features.');
  it.skip(isAndroid);
  it.slow();
  await page.goto(server.PREFIX + '/input/fileupload.html');
  const uploadFile = testInfo.outputPath('200MB.zip');
  const str = 'A'.repeat(4 * 1024);
  const stream = fs.createWriteStream(uploadFile);
  for (let i = 0; i < 50 * 1024; i++) {
    await new Promise<void>((fulfill, reject) => {
      stream.write(str, err => {
        if (err)
          reject(err);
        else
          fulfill();
      });
    });
  }
  await new Promise(f => stream.end(f));
  const input = page.locator('input[type="file"]');
  const events = await input.evaluateHandle(e => {
    const events = [];
    e.addEventListener('input', () => events.push('input'));
    e.addEventListener('change', () => events.push('change'));
    return events;
  });
  const relativeUploadPath = path.relative(process.cwd(), uploadFile);
  expect(path.isAbsolute(relativeUploadPath)).toBeFalsy();
  await input.setInputFiles(relativeUploadPath);
  expect(await input.evaluate(e => (e as HTMLInputElement).files[0].name)).toBe('200MB.zip');
  expect(await events.evaluate(e => e)).toEqual(['input', 'change']);
  const serverFilePromise = new Promise<formidable.File>(fulfill => {
    server.setRoute('/upload', async (req, res) => {
      const form = new formidable.IncomingForm({ uploadDir: testInfo.outputPath() });
      form.parse(req, function(err, fields, f) {
        res.end();
        const files = f as Record<string, formidable.File>;
        fulfill(files.file1);
      });
    });
  });
  const [file1] = await Promise.all([
    serverFilePromise,
    page.click('input[type=submit]')
  ]);
  expect(file1.originalFilename).toBe('200MB.zip');
  expect(file1.size).toBe(200 * 1024 * 1024);
  await Promise.all([uploadFile, file1.filepath].map(fs.promises.unlink));
});

it('should work @smoke', async ({ page, asset }) => {
  await page.setContent(`<input type=file>`);
  await page.setInputFiles('input', asset('file-to-upload.txt'));
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should work with label', async ({ page, asset }) => {
  await page.setContent(`<label for=target>Choose a file</label><input id=target type=file>`);
  await page.setInputFiles('text=Choose a file', asset('file-to-upload.txt'));
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should set from memory', async ({ page }) => {
  await page.setContent(`<input type=file>`);
  await page.setInputFiles('input', {
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is a test')
  });
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('test.txt');
});

it('should emit event once', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => page.once('filechooser', f)),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should emit event via prepend', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => page.prependListener('filechooser', f)),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should emit event for iframe', async ({ page, server, browserName }) => {
  it.skip(browserName === 'firefox');
  const frame = await attachFrame(page, 'frame1', server.EMPTY_PAGE);
  await frame.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => page.once('filechooser', f)),
    frame.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should emit event on/off', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => {
      const listener = chooser => {
        page.off('filechooser', listener);
        f(chooser);
      };
      page.on('filechooser', listener);
    }),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should emit event addListener/removeListener', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    new Promise(f => {
      const listener = chooser => {
        page.removeListener('filechooser', listener);
        f(chooser);
      };
      page.addListener('filechooser', listener);
    }),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should work when file input is attached to DOM', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

it('should work when file input is not attached to DOM', async ({ page, asset }) => {
  const [,content] = await Promise.all([
    page.waitForEvent('filechooser').then(chooser => chooser.setFiles(asset('file-to-upload.txt'))),
    page.evaluate(async () => {
      const el = document.createElement('input');
      el.type = 'file';
      el.click();
      await new Promise(x => el.oninput = x);
      const reader = new FileReader();
      const promise = new Promise(fulfill => reader.onload = fulfill);
      reader.readAsText(el.files[0]);
      return promise.then(() => reader.result);
    }),
  ]);
  expect(content).toBe('contents of the file');
});

it('should not throw when filechooser belongs to iframe', async ({ page, server, browserName }) => {
  await page.goto(server.PREFIX + '/frames/one-frame.html');
  const frame = page.mainFrame().childFrames()[0];
  await frame.setContent(`
    <div>Click me</div>
    <script>
      document.querySelector('div').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.click();
        window.parent.__done = true;
      });
    </script>
  `);
  await Promise.all([
    page.waitForEvent('filechooser'),
    frame.click('div')
  ]);
  await page.waitForFunction(() => (window as any).__done);
});

it('should not throw when frame is detached immediately', async ({ page, server }) => {
  await page.goto(server.PREFIX + '/frames/one-frame.html');
  const frame = page.mainFrame().childFrames()[0];
  await frame.setContent(`
    <div>Click me</div>
    <script>
      document.querySelector('div').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.click();
        window.parent.__done = true;
        const iframe = window.parent.document.querySelector('iframe');
        iframe.remove();
      });
    </script>
  `);
  page.on('filechooser', () => {});  // To ensure we handle file choosers.
  await frame.click('div');
  await page.waitForFunction(() => (window as any).__done);
});

it('should work with CSP', async ({ page, server, asset }) => {
  server.setCSP('/empty.html', 'default-src "none"');
  await page.goto(server.EMPTY_PAGE);
  await page.setContent(`<input type=file>`);
  await page.setInputFiles('input', asset('file-to-upload.txt'));
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should respect timeout', async ({ page, playwright }) => {
  let error = null;
  await page.waitForEvent('filechooser', { timeout: 1 }).catch(e => error = e);
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should respect default timeout when there is no custom timeout', async ({ page, playwright }) => {
  page.setDefaultTimeout(1);
  let error = null;
  await page.waitForEvent('filechooser').catch(e => error = e);
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should prioritize exact timeout over default timeout', async ({ page, playwright }) => {
  page.setDefaultTimeout(0);
  let error = null;
  await page.waitForEvent('filechooser', { timeout: 1 }).catch(e => error = e);
  expect(error).toBeInstanceOf(playwright.errors.TimeoutError);
});

it('should work with no timeout', async ({ page, server }) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 0 }),
    page.evaluate(() => setTimeout(() => {
      const el = document.createElement('input');
      el.type = 'file';
      el.click();
    }, 50))
  ]);
  expect(chooser).toBeTruthy();
});

it('should return the same file chooser when there are many watchdogs simultaneously', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [fileChooser1, fileChooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.waitForEvent('filechooser'),
    page.$eval('input', input => input.click()),
  ]);
  expect(fileChooser1 === fileChooser2).toBe(true);
});

it('should accept single file', async ({ page, asset }) => {
  await page.setContent(`<input type=file oninput='javascript:console.timeStamp()'>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.page()).toBe(page);
  expect(fileChooser.element()).toBeTruthy();
  await fileChooser.setFiles(asset('file-to-upload.txt'));
  expect(await page.$eval('input', input => input.files.length)).toBe(1);
  expect(await page.$eval('input', input => input.files[0].name)).toBe('file-to-upload.txt');
});

it('should detect mime type', async ({ page, server, asset, isAndroid }) => {
  it.fixme(isAndroid);

  let files: Record<string, formidable.File>;
  server.setRoute('/upload', async (req, res) => {
    const form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, f) {
      files = f as Record<string, formidable.File>;
      res.end();
    });
  });
  await page.goto(server.EMPTY_PAGE);
  await page.setContent(`
    <form action="/upload" method="post" enctype="multipart/form-data" >
      <input type="file" name="file1">
      <input type="file" name="file2">
      <input type="submit" value="Submit">
    </form>`);
  await (await page.$('input[name=file1]')).setInputFiles(asset('file-to-upload.txt'));
  await (await page.$('input[name=file2]')).setInputFiles(asset('pptr.png'));
  await Promise.all([
    page.click('input[type=submit]'),
    server.waitForRequest('/upload'),
  ]);
  const { file1, file2 } = files;
  expect(file1.originalFilename).toBe('file-to-upload.txt');
  expect(file1.mimetype).toBe('text/plain');
  expect(fs.readFileSync(file1.filepath).toString()).toBe(
      fs.readFileSync(asset('file-to-upload.txt')).toString());
  expect(file2.originalFilename).toBe('pptr.png');
  expect(file2.mimetype).toBe('image/png');
  expect(fs.readFileSync(file2.filepath).toString()).toBe(
      fs.readFileSync(asset('pptr.png')).toString());
});

// @see https://github.com/microsoft/playwright/issues/4704
it('should not trim big uploaded files', async ({ page, server, asset, isAndroid }) => {
  it.fixme(isAndroid);

  let files: Record<string, formidable.File>;
  server.setRoute('/upload', async (req, res) => {
    const form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, f) {
      files = f as Record<string, formidable.File>;
      res.end();
    });
  });
  await page.goto(server.EMPTY_PAGE);

  const DATA_SIZE = Math.pow(2, 20);
  await Promise.all([
    page.evaluate(async size => {
      const body = new FormData();
      body.set('file', new Blob([new Uint8Array(size)]));
      await fetch('/upload', { method: 'POST', body });
    }, DATA_SIZE),
    server.waitForRequest('/upload'),
  ]);
  expect(files.file.size).toBe(DATA_SIZE);
});

it('should be able to read selected file', async ({ page, asset }) => {
  await page.setContent(`<input type=file>`);
  const [, content] = await Promise.all([
    page.waitForEvent('filechooser').then(fileChooser => fileChooser.setFiles(asset('file-to-upload.txt'))),
    page.$eval('input', async picker => {
      picker.click();
      await new Promise(x => picker.oninput = x);
      const reader = new FileReader();
      const promise = new Promise(fulfill => reader.onload = fulfill);
      reader.readAsText(picker.files[0]);
      return promise.then(() => reader.result);
    }),
  ]);
  expect(content).toBe('contents of the file');
});

it('should be able to reset selected files with empty file list', async ({ page, asset }) => {
  await page.setContent(`<input type=file>`);
  const [, fileLength1] = await Promise.all([
    page.waitForEvent('filechooser').then(fileChooser => fileChooser.setFiles(asset('file-to-upload.txt'))),
    page.$eval('input', async picker => {
      picker.click();
      await new Promise(x => picker.oninput = x);
      return picker.files.length;
    }),
  ]);
  expect(fileLength1).toBe(1);
  const [, fileLength2] = await Promise.all([
    page.waitForEvent('filechooser').then(fileChooser => fileChooser.setFiles([])),
    page.$eval('input', async picker => {
      picker.click();
      await new Promise(x => picker.oninput = x);
      return picker.files.length;
    }),
  ]);
  expect(fileLength2).toBe(0);
});

it('should not accept multiple files for single-file input', async ({ page, asset }) => {
  await page.setContent(`<input type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  let error = null;
  await fileChooser.setFiles([
    asset('file-to-upload.txt'),
    asset('pptr.png')
  ]).catch(e => error = e);
  expect(error).not.toBe(null);
});

it('should emit input and change events', async ({ page, asset }) => {
  const events = [];
  await page.exposeFunction('eventHandled', e => events.push(e));
  await page.setContent(`
  <input id=input type=file></input>
  <script>
    input.addEventListener('input', e => eventHandled({ type: e.type }));
    input.addEventListener('change', e => eventHandled({ type: e.type }));
  </script>`);
  await (await page.$('input')).setInputFiles(asset('file-to-upload.txt'));
  expect(events.length).toBe(2);
  expect(events[0].type).toBe('input');
  expect(events[1].type).toBe('change');
});

it('should work for single file pick', async ({ page, server }) => {
  await page.setContent(`<input type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.isMultiple()).toBe(false);
});

it('should work for "multiple"', async ({ page, server }) => {
  await page.setContent(`<input multiple type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.isMultiple()).toBe(true);
});

it('should work for "webkitdirectory"', async ({ page, server }) => {
  await page.setContent(`<input multiple webkitdirectory type=file>`);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(fileChooser.isMultiple()).toBe(true);
});

it('should emit event after navigation', async ({ page, server, browserName, browserMajorVersion }) => {
  it.info().annotations.push({ type: 'issue', description: 'https://github.com/microsoft/playwright/issues/11375' });
  it.skip(browserName === 'chromium' && browserMajorVersion < 99);

  const logs = [];
  page.on('filechooser', () => logs.push('filechooser'));
  await page.goto(server.PREFIX + '/empty.html');
  await page.setContent(`<input type=file>`);
  await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
  await page.setContent(`<input type=file>`);
  await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('input'),
  ]);
  expect(logs).toEqual(['filechooser', 'filechooser']);
});

it('should trigger listener added before navigation', async ({ page, server, browserMajorVersion, isElectron }) => {
  it.skip(isElectron && browserMajorVersion <= 98);
  // Add listener before cross process navigation.
  const chooserPromise = new Promise(f => page.once('filechooser', f));
  await page.goto(server.PREFIX + '/empty.html');
  await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
  await page.setContent(`<input type=file>`);
  const [chooser] = await Promise.all([
    chooserPromise,
    page.click('input'),
  ]);
  expect(chooser).toBeTruthy();
});

