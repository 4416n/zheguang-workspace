import test from 'node:test';
import assert from 'node:assert/strict';
import { request, fixture, auth } from './helpers.mjs';
import { openDatabase } from '../server/db.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('login, dashboard, task updates and logout work end to end', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const login = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026',
      remember: true
    }
  });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.role, 'admin');
  const session = auth(login);
  const dashboard = await request(app, '/api/dashboard', session);
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.json.projects.length >= 4);
  assert.ok(dashboard.json.stats.tasks >= 14);
  const createProject = await request(app, '/api/projects', {
    method: 'POST',
    ...session,
    body: {
      name: '接口验收项目',
      description: '验证全链路',
      color: '#123456',
      due_date: '2026-12-01'
    }
  });
  assert.equal(createProject.status, 201);
  const projectId = createProject.json.project.id;
  const createTask = await request(app, `/api/projects/${projectId}/tasks`, {
    method: 'POST',
    ...session,
    body: {
      title: '完成接口验收',
      description: '覆盖登录、权限、任务和审计',
      status: 'todo',
      priority: 'high',
      assignee_id: 1
    }
  });
  assert.equal(createTask.status, 201);
  const taskId = createTask.json.task.id;
  const updateTask = await request(app, `/api/tasks/${taskId}`, {
    method: 'PATCH',
    ...session,
    body: {
      status: 'done'
    }
  });
  assert.equal(updateTask.status, 200);
  assert.equal(updateTask.json.task.status, 'done');
  const archived = await request(app, `/api/projects/${projectId}/archive`, {
    method: 'POST',
    ...session
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.json.project.status, 'archived');
  const logout = await request(app, '/api/auth/logout', {
    method: 'POST',
    ...session
  });
  assert.equal(logout.status, 204);
  const unauthorized = await request(app, '/api/dashboard', session);
  assert.equal(unauthorized.status, 401);
});
test('member access is scoped and cannot perform admin actions', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const adminLogin = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  });
  const admin = auth(adminLogin);
  const privateProject = await request(app, '/api/projects', {
    method: 'POST',
    ...admin,
    body: {
      name: '私密项目',
      description: '仅管理员可见',
      color: '#123456'
    }
  });
  const memberLogin = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  });
  const member = auth(memberLogin);
  const forbidden = await request(app, `/api/projects/${privateProject.json.project.id}`, {
    ...member
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.error.code, 'FORBIDDEN');
  const adminOnly = await request(app, '/api/admin/overview', {
    ...member
  });
  assert.equal(adminOnly.status, 403);
  const csrfMissing = await request(app, '/api/projects', {
    method: 'POST',
    cookie: member.cookie,
    body: {
      name: '不能创建'
    }
  });
  assert.equal(csrfMissing.status, 403);
  assert.equal(csrfMissing.json.error.code, 'CSRF_INVALID');
});
test('password recovery code rotates after reset', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const firstLogin = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  });
  const session = auth(firstLogin);
  const codeResponse = await request(app, '/api/auth/recovery-code', {
    method: 'POST',
    ...session,
    body: {
      password: 'Member@2026'
    }
  });
  assert.equal(codeResponse.status, 200);
  assert.match(codeResponse.json.recoveryCode, /^[A-F0-9-]+$/);
  const reset = await request(app, '/api/auth/recovery/reset', {
    method: 'POST',
    body: {
      email: 'lin@zheguang.local',
      code: codeResponse.json.recoveryCode,
      newPassword: 'MemberNext@2026'
    }
  });
  assert.equal(reset.status, 200);
  assert.ok(reset.json.recoveryCode);
  const old = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  });
  assert.equal(old.status, 401);
  const next = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'MemberNext@2026'
    }
  });
  assert.equal(next.status, 200);
});
test('task patch preserves description and due date, and validates assignment', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const login = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  });
  const session = auth(login);
  const before = await request(app, '/api/tasks/3', session);
  const changed = await request(app, '/api/tasks/3', {
    ...session,
    method: 'PATCH',
    body: {
      status: 'done'
    }
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.task.description, before.json.task.description);
  assert.equal(changed.json.task.due_date, before.json.task.due_date);
  assert.ok(changed.json.task.completed_at);
  const reopened = await request(app, '/api/tasks/3', {
    ...session,
    method: 'PATCH',
    body: {
      status: 'doing'
    }
  });
  assert.equal(reopened.json.task.completed_at, null);
  assert.equal((await request(app, '/api/tasks/13', {
    ...session,
    method: 'PATCH',
    body: {
      assignee_id: 3
    }
  })).status, 400);
  assert.equal((await request(app, '/api/tasks/3', {
    ...session,
    method: 'PATCH',
    body: {
      due_date: '2026-02-31'
    }
  })).status, 400);
  assert.equal((await request(app, '/api/tasks/3', {
    ...session,
    method: 'PATCH',
    body: {
      status: 'invented'
    }
  })).status, 400);
});
test('registration, profile updates, settings and account disabling work', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const registered = await request(app, '/api/auth/register', {
    method: 'POST',
    body: {
      username: 'newuser',
      name: '新成员',
      email: 'new@example.com',
      password: 'NewMember@2026',
      role: 'admin'
    }
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.json.user.role, 'member');
  assert.ok(registered.json.recoveryCode);
  const member = auth(registered),
    memberId = registered.json.user.id;
  const profile = await request(app, '/api/profile', {
    ...member,
    method: 'PATCH',
    body: {
      name: '更新后的名字',
      bio: '协作测试',
      role: 'admin'
    }
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.json.user.role, 'member');
  assert.equal(profile.json.user.name, '更新后的名字');
  const duplicate = await request(app, '/api/auth/register', {
    method: 'POST',
    body: {
      username: 'newuser',
      name: '重复',
      email: 'other@example.com',
      password: 'NewMember@2026'
    }
  });
  assert.equal(duplicate.status, 409);
  const login = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  });
  const admin = auth(login);
  const config = await request(app, '/api/admin/settings', {
    ...admin,
    method: 'PATCH',
    body: {
      site_name: '测试工作台',
      registration_enabled: 'false'
    }
  });
  assert.equal(config.status, 200);
  assert.equal((await request(app, '/api/config')).json.registration_enabled, false);
  assert.equal((await request(app, '/api/auth/register', {
    method: 'POST',
    body: {
      username: 'blocked',
      name: '关闭',
      email: 'blocked@example.com',
      password: 'NewMember@2026'
    }
  })).status, 403);
  assert.equal((await request(app, `/api/admin/users/${memberId}`, {
    ...admin,
    method: 'PATCH',
    body: {
      status: 'disabled'
    }
  })).status, 200);
  assert.equal((await request(app, '/api/auth/me', member)).status, 401);
  assert.equal((await request(app, '/api/admin/users/1', {
    ...admin,
    method: 'PATCH',
    body: {
      role: 'member'
    }
  })).status, 400);
  assert.equal((await request(app, '/api/admin/users/1', {
    ...admin,
    method: 'PATCH',
    body: {
      status: 'disabled'
    }
  })).status, 400);
});
test('membership removal revokes access, unassigns tasks and hides private activity', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const a = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  }));
  const m = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  }));
  const p = (await request(app, '/api/projects', {
    ...a,
    method: 'POST',
    body: {
      name: '机密计划'
    }
  })).json.project.id;
  assert.equal((await request(app, `/api/projects/${p}/members`, {
    ...a,
    method: 'POST',
    body: {
      user_id: 2
    }
  })).status, 204);
  const task = (await request(app, `/api/projects/${p}/tasks`, {
    ...a,
    method: 'POST',
    body: {
      title: '成员负责事项',
      assignee_id: 2
    }
  })).json.task;
  assert.equal((await request(app, `/api/projects/${p}/comments`, {
    ...m,
    method: 'POST',
    body: {
      task_id: task.id,
      body: '已收到任务'
    }
  })).status, 201);
  assert.equal((await request(app, `/api/tasks/${task.id}`, m)).json.comments.length, 1);
  assert.equal((await request(app, `/api/projects/${p}`, {
    ...m,
    method: 'PATCH',
    body: {
      name: '不允许修改'
    }
  })).status, 403);
  assert.equal((await request(app, `/api/projects/${p}/members?user_id=2`, {
    ...a,
    method: 'DELETE'
  })).status, 204);
  assert.equal((await request(app, `/api/tasks/${task.id}`, m)).status, 403);
  assert.equal((await request(app, `/api/tasks/${task.id}`, a)).json.task.assignee_id, null);
  const dashboard = await request(app, '/api/dashboard', m);
  assert.equal(dashboard.status, 200);
  assert.ok(!dashboard.json.projects.some(x => x.id === p));
  assert.ok(!dashboard.json.activity.some(x => x.project_id === p));
  assert.ok(!(await request(app, '/api/tasks', m)).json.mine.some(x => x.id === task.id));
  assert.equal((await request(app, `/api/projects/${p}`, {
    ...a,
    method: 'DELETE'
  })).status, 204);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM comments WHERE task_id=?').get(task.id).n, 0);
});
test('announcement lifecycle is restricted to administrators and audited', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const a = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  }));
  const m = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  }));
  assert.equal((await request(app, '/api/announcements', {
    ...m,
    method: 'POST',
    body: {
      title: '无权限',
      body: '公告'
    }
  })).status, 403);
  const created = await request(app, '/api/announcements', {
    ...a,
    method: 'POST',
    body: {
      title: '验收公告',
      body: '可见的正文',
      pinned: true
    }
  });
  assert.equal(created.status, 201);
  const aid = created.json.id;
  assert.equal((await request(app, `/api/announcements/${aid}`, {
    ...a,
    method: 'PATCH',
    body: {
      body: '修改后的正文',
      pinned: false
    }
  })).status, 200);
  const announcements = (await request(app, '/api/announcements', m)).json.announcements;
  assert.equal(announcements.find(x => x.id === aid).body, '修改后的正文');
  assert.equal((await request(app, `/api/announcements/${aid}`, {
    ...a,
    method: 'DELETE'
  })).status, 204);
  const audit = (await request(app, '/api/admin/overview', a)).json.activities;
  assert.ok(audit.some(x => x.action === 'announcement.delete'));
});
test('requests reject cross-origin writes, invalid payloads and oversized bodies', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  assert.equal((await request(app, '/api/auth/login', {
    method: 'POST',
    origin: 'https://attacker.example',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  })).status, 403);
  assert.equal((await request(app, '/api/auth/login', {
    method: 'POST',
    body: []
  })).status, 400);
  assert.equal((await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'a'.repeat(70000)
    }
  })).status, 413);
  const config = await request(app, '/api/config');
  assert.ok(config.headers['content-security-policy'].includes("script-src 'self'"));
});
test('changing a password logs out other sessions and recovery cannot be reused', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const a = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  }));
  const b = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  }));
  assert.equal((await request(app, '/api/auth/change-password', {
    ...a,
    method: 'POST',
    body: {
      currentPassword: 'Member@2026',
      newPassword: 'Updated@2026'
    }
  })).status, 200);
  assert.equal((await request(app, '/api/auth/me', b)).status, 401);
  assert.equal((await request(app, '/api/auth/me', a)).status, 200);
  const code = (await request(app, '/api/auth/recovery-code', {
    ...a,
    method: 'POST',
    body: {
      password: 'Updated@2026'
    }
  })).json.recoveryCode;
  const reset = await request(app, '/api/auth/recovery/reset', {
    method: 'POST',
    body: {
      email: 'lin@zheguang.local',
      code,
      newPassword: 'Recovered@2026'
    }
  });
  assert.equal(reset.status, 200);
  assert.equal((await request(app, '/api/auth/recovery/reset', {
    method: 'POST',
    body: {
      email: 'lin@zheguang.local',
      code,
      newPassword: 'Different@2026'
    }
  })).status, 400);
  assert.equal((await request(app, '/api/auth/me', a)).status, 401);
});
test('static assets load and server files remain inaccessible', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const page = await request(app, '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /src="\/app.js"/);
  const script = await request(app, '/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);
  const css = await request(app, '/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.text, /prefers-reduced-motion/);
  assert.equal((await request(app, '/', {
    method: 'HEAD'
  })).text, '');
  for (const path of ['/server/app.js', '/data/zheguang.sqlite', '/.env', '/%2e%2e%2fserver%2fapp.js', '/missing.js']) assert.equal((await request(app, path)).status, 404, path);
});
test('a recovery code only accepts one of two concurrent resets', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const s = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'lin',
      password: 'Member@2026'
    }
  }));
  const code = (await request(app, '/api/auth/recovery-code', {
    ...s,
    method: 'POST',
    body: {
      password: 'Member@2026'
    }
  })).json.recoveryCode;
  const results = await Promise.all(['FirstNew@2026', 'SecondNew@2026'].map(newPassword => request(app, '/api/auth/recovery/reset', {
    method: 'POST',
    body: {
      email: 'lin@zheguang.local',
      code,
      newPassword
    }
  })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});
test('archived projects reject task writes and keep previous audit records after deletion', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const s = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'admin',
      password: 'Zheguang@2026'
    }
  }));
  assert.equal((await request(app, '/api/projects/1/archive', {
    ...s,
    method: 'POST'
  })).status, 200);
  assert.equal((await request(app, '/api/projects/1/tasks', {
    ...s,
    method: 'POST',
    body: {
      title: '不应添加'
    }
  })).status, 409);
  assert.equal((await request(app, '/api/tasks/3', {
    ...s,
    method: 'PATCH',
    body: {
      status: 'done'
    }
  })).status, 409);
  const count = db.prepare('SELECT COUNT(*) n FROM activities WHERE project_id=1').get().n;
  assert.equal((await request(app, '/api/projects/1', {
    ...s,
    method: 'DELETE'
  })).status, 204);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM activities WHERE detail LIKE '%原项目：折光%' AND project_id IS NULL").get().n >= count);
});
test('database persists across restarts and production refuses demo storage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'zheguang-db-'));
  t.after(() => rm(directory, {
    recursive: true,
    force: true
  }));
  const path = join(directory, 'persist.sqlite');
  let db = await openDatabase(path);
  db.prepare("UPDATE projects SET name='持久化项目' WHERE id=1").run();
  db.close();
  db = await openDatabase(path);
  assert.equal(db.prepare('SELECT name FROM projects WHERE id=1').get().name, '持久化项目');
  db.close();
  await assert.rejects(openDatabase(path, {
    production: true,
    adminEmail: 'admin@example.com',
    adminPassword: 'ProductionAdmin@2026'
  }), /演示数据库/);
  await assert.rejects(openDatabase(':memory:', {
    production: true
  }), /ADMIN_EMAIL/);
  const prod = await openDatabase(join(directory, 'production.sqlite'), {
    production: true,
    adminEmail: 'admin@example.com',
    adminPassword: 'ProductionAdmin@2026'
  });
  assert.equal(prod.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  assert.equal(prod.prepare('SELECT COUNT(*) n FROM projects').get().n, 0);
  prod.close();
});
test('excessive login requests are rate limited', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  let response;
  for (let i = 0; i < 31; i++) response = await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'missing',
      password: 'invalid'
    }
  });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers['retry-after']) > 0);
});
test('search respects project membership and supports task descriptions', async t => {
  const {
    db,
    app
  } = await fixture();
  t.after(() => db.close());
  const s = auth(await request(app, '/api/auth/login', {
    method: 'POST',
    body: {
      account: 'chen',
      password: 'Member@2026'
    }
  }));
  const found = await request(app, '/api/search?q=' + encodeURIComponent('视觉'), s);
  assert.equal(found.status, 200);
  assert.ok(found.json.tasks.length > 0);
  const privateResult = await request(app, '/api/search?q=' + encodeURIComponent('灵感收集站'), s);
  assert.equal(privateResult.json.projects.length, 0);
  const hiddenTask = await request(app, '/api/search?q=' + encodeURIComponent('探索更自然的动效'), s);
  assert.equal(hiddenTask.json.tasks.length, 0);
});
