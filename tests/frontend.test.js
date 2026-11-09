import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fixture, request, auth } from './helpers.mjs';

// Exercise the actual rendering functions against API data without a browser or network port.
// This does not replace visual browser verification.
async function frontendHarness(app, session) {
  const element = () => ({
    innerHTML: '',
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      }
    },
    style: {},
    querySelectorAll() {
      return [];
    },
    focus() {},
    append() {},
    remove() {}
  });
  const nodes = {
    '#app': element(),
    '#modal-root': element(),
    '#toast-stack': element()
  };
  const document = {
    activeElement: null,
    body: element(),
    querySelector(selector) {
      return nodes[selector] || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    createElement: element
  };
  const context = vm.createContext({
    document,
    window: {
      addEventListener() {}
    },
    location: {
      hash: ''
    },
    history: {
      pushState() {},
      replaceState() {}
    },
    setTimeout() {},
    requestAnimationFrame() {},
    console,
    URL,
    Intl,
    Date,
    fetch: async (path, options = {}) => {
      const r = await request(app, path, {
        ...session,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : undefined,
        csrf: options.headers?.['x-csrf-token'] || session.csrf
      });
      return {
        ok: r.status < 400,
        status: r.status,
        json: async () => r.json
      };
    }
  });
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/\bboot\(\);/, '');
  vm.runInContext(source, context);
  const me = (await request(app, '/api/auth/me', session)).json;
  context.initialUser = me.user;
  context.initialCsrf = me.csrfToken;
  vm.runInContext('state.user=initialUser;state.csrf=initialCsrf;', context);
  return {
    run: code => vm.runInContext(code, context),
    nodes,
    context
  };
}
test('all application pages render from actual API responses', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const session = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  }));
  const h = await frontendHarness(app, session);
  for (const view of ['dashboard', 'projects', 'tasks', 'project', 'announcements', 'admin', 'settings']) {
    await h.run(`state.view='${view}';state.detailId=1;loadView()`);
    assert.match(h.nodes['#app'].innerHTML, /app-shell/, view);
    assert.doesNotMatch(h.nodes['#app'].innerHTML, /页面暂时无法加载|undefined|NaN/, view);
  }
  for (const open of ['openCreateProject()', 'createTaskDialog()', 'openTaskDetail(3)', 'openRecovery()', 'openRegister()', 'openCreateUser()', 'openAnnouncement()']) {
    await h.run(open);
    assert.match(h.nodes['#modal-root'].innerHTML, /role="dialog"/, open);
    assert.doesNotMatch(h.nodes['#modal-root'].innerHTML, /undefined|NaN/, open);
  }
  await h.run('openRegister()');
  const pattern = h.nodes['#modal-root'].innerHTML.match(/pattern="([^"]+)"/)[1];
  const regex = new RegExp(`^(?:${pattern})$`, 'v');
  assert.ok(regex.test('valid-user'));
  assert.ok(!regex.test('0bad'));
});
test('user content is escaped and member navigation hides administrative controls', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  db.prepare('UPDATE projects SET name=? WHERE id=1').run('<img src=x onerror=alert(1)>');
  db.prepare('UPDATE users SET name=? WHERE id=2').run('<i>恶意姓名');
  const session = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  }));
  const h = await frontendHarness(app, session);
  await h.run("state.view='projects';loadView()");
  assert.doesNotMatch(h.nodes['#app'].innerHTML, /<img src=x|<i>恶意|data-view="admin"/);
  assert.match(h.nodes['#app'].innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  await h.run("state.view='project';state.detailId=1;loadView()");
  assert.doesNotMatch(h.nodes['#app'].innerHTML, /data-action="manage-members"|data-action="project-settings"/);
});
test('a slow old page response cannot overwrite a newer page', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const session = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  }));
  const h = await frontendHarness(app, session);
  const actualFetch = h.context.fetch;
  let release;
  h.context.fetch = async (path, options) => {
    if (path === '/api/projects') await new Promise(resolve => {
      release = resolve;
    });
    return actualFetch(path, options);
  };
  const slow = h.run("state.view='projects';loadView()");
  await h.run("state.view='tasks';loadView()");
  const newest = h.nodes['#app'].innerHTML;
  release();
  await slow;
  assert.equal(h.nodes['#app'].innerHTML, newest);
  assert.ok(h.run('Array.isArray(state.data.mine)'));
});
