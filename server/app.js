import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, relative } from 'node:path';
import { digest, hashPassword, passwordError, recoveryCode, token, verifyPassword } from './security.js';
import { iso, publicUser } from './db.js';
const COOKIE = 'zg_session';
const clean = (value, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fields = 'id,username,email,name,role,status,bio,created_at';
const own = (obj, key) => Object.hasOwn(obj, key);
const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(data));
};
const empty = res => {
  res.writeHead(204);
  res.end();
};
const fail = (status, message, code = 'BAD_REQUEST') => {
  throw Object.assign(new Error(message), {
    status,
    code
  });
};
const id = value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) fail(400, '编号无效');
  return n;
};
const required = (value, label, max = 180) => {
  const result = clean(value, max);
  if (!result) fail(400, `${label}不能为空`);
  return result;
};
const choice = (value, values) => {
  if (!values.includes(value)) fail(400, '选项无效');
  return value;
};
const date = value => {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, '日期格式无效');
  return value;
};
const color = value => {
  if (!/^#[0-9a-f]{6}$/i.test(value)) fail(400, '项目颜色无效');
  return value;
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(x => x.includes('=')).map(x => {
  const i = x.indexOf('=');
  return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
}));
const cookie = (res, value, days, production) => res.setHeader('set-cookie', `${COOKIE}=${value}; Max-Age=${days * 86400}; Path=/; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}`);
const userRow = (db, userId) => db.prepare(`SELECT ${fields} FROM users WHERE id=?`).get(userId);
const settings = db => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x => [x.key, x.value]));
const audit = (db, userId, action, detail, projectId = null) => db.prepare('INSERT INTO activities(user_id,action,detail,project_id,created_at) VALUES (?,?,?,?,?)').run(userId, action, detail, projectId, iso());
const transaction = (db, fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};
async function readBody(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType && !req.headers['transfer-encoding'] && (!req.headers['content-length'] || req.headers['content-length'] === '0')) return {};
  if (!/^application\/json\b/i.test(contentType)) fail(415, '请使用 JSON 请求');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    length += buffer.length;
    if (length > 65536) fail(413, '请求内容过大');
    chunks.push(buffer);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch {
    fail(400, 'JSON 格式不正确');
  }
}
function accountData(p) {
  const username = clean(p.username, 40),
    email = clean(p.email, 160).toLowerCase(),
    name = required(p.name, '姓名', 80);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/.test(username)) fail(400, '用户名为 3–32 位，字母开头，可包含数字、下划线和短横线');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '请输入有效邮箱');
  const error = passwordError(p.password);
  if (error) fail(400, error);
  return {
    username,
    email,
    name
  };
}
function currentSession(db, req) {
  const raw = cookies(req)[COOKIE];
  if (!raw) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(raw), iso());
  if (!session) return null;
  const user = userRow(db, session.user_id);
  return user?.status === 'active' ? {
    user,
    session
  } : null;
}
function makeSession(db, req, res, user, remember, production) {
  const raw = token(),
    csrfToken = token(16),
    days = remember ? 30 : 1;
  const old = cookies(req)[COOKIE];
  if (old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(old));
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(iso());
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(raw), user.id, csrfToken, new Date(Date.now() + days * 86400000).toISOString());
  cookie(res, raw, days, production);
  return {
    user: publicUser(user),
    csrfToken
  };
}
const projectSelect = `SELECT p.*,u.name owner_name,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') done_count,
  (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id) member_count
  FROM projects p JOIN users u ON u.id=p.owner_id`;
const projectRow = (db, projectId) => db.prepare(`${projectSelect} WHERE p.id=?`).get(projectId);
function visibleSql(user, alias = 'p') {
  return user.role === 'admin' ? ['1=1', []] : [`EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=${alias}.id AND m.user_id=?)`, [user.id]];
}
function accessProject(db, user, projectId, manage = false) {
  const project = projectRow(db, projectId);
  if (!project) fail(404, '项目不存在', 'NOT_FOUND');
  if (user.role !== 'admin' && !db.prepare('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?').get(projectId, user.id)) fail(403, '你没有这个项目的访问权限', 'FORBIDDEN');
  if (manage && user.role !== 'admin' && project.owner_id !== user.id) fail(403, '需要项目负责人或管理员权限', 'FORBIDDEN');
  return project;
}
function requireAdmin(user) {
  if (user.role !== 'admin') fail(403, '需要管理员权限', 'FORBIDDEN');
}
function taskView(db, t) {
  return {
    ...t,
    assignee: t.assignee_id ? userRow(db, t.assignee_id) : null,
    creator: userRow(db, t.creator_id)
  };
}
function assignee(db, projectId, value) {
  if (!value) return null;
  const userId = id(value);
  if (!db.prepare(`SELECT 1 FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.user_id=? AND u.status='active'`).get(projectId, userId)) fail(400, '负责人必须是当前项目的可用成员');
  return userId;
}
function taskChanges(db, projectId, p, previous = {}) {
  return {
    title: own(p, 'title') ? required(p.title, '任务标题') : previous.title,
    description: own(p, 'description') ? clean(p.description) : previous.description || '',
    status: own(p, 'status') ? choice(p.status, ['todo', 'doing', 'done']) : previous.status || 'todo',
    priority: own(p, 'priority') ? choice(p.priority, ['low', 'medium', 'high']) : previous.priority || 'medium',
    assignee_id: own(p, 'assignee_id') ? assignee(db, projectId, p.assignee_id) : previous.assignee_id || null,
    due_date: own(p, 'due_date') ? date(p.due_date) : previous.due_date || null
  };
}
async function handleApi(db, req, res, url, production) {
  const method = req.method,
    path = url.pathname,
    mutation = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method);
  const current = currentSession(db, req),
    p = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(req) : {};
  if (mutation && current && req.headers['x-csrf-token'] !== current.session.csrf_token) fail(403, '页面已过期，请刷新重试', 'CSRF_INVALID');
  if (path === '/api/config' && method === 'GET') {
    const s = settings(db);
    return json(res, 200, {
      site_name: s.site_name,
      site_description: s.site_description,
      registration_enabled: s.registration_enabled === 'true',
      demo: !production
    });
  }
  if (path === '/api/health' && method === 'GET') {
    db.prepare('SELECT 1').get();
    return json(res, 200, {
      status: 'ok'
    });
  }
  if (path === '/api/auth/me' && method === 'GET') {
    if (!current) fail(401, '请先登录', 'UNAUTHENTICATED');
    return json(res, 200, {
      user: current.user,
      csrfToken: current.session.csrf_token
    });
  }
  if (path === '/api/auth/login' && method === 'POST') {
    const account = clean(p.account, 160).toLowerCase(),
      password = typeof p.password === 'string' ? p.password : '';
    if (password.length > 128) fail(401, '账号或密码不正确', 'INVALID_CREDENTIALS');
    const user = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').get(account, account);
    if (!user || !(await verifyPassword(password, user.password_hash)) || user.status !== 'active') fail(401, '账号或密码不正确', 'INVALID_CREDENTIALS');
    const session = makeSession(db, req, res, user, Boolean(p.remember), production);
    audit(db, user.id, 'auth.login', '登录了折光工作台');
    return json(res, 200, session);
  }
  if (path === '/api/auth/register' && method === 'POST') {
    if (settings(db).registration_enabled !== 'true') fail(403, '当前未开放注册，请联系管理员');
    const u = accountData(p),
      code = recoveryCode(),
      hash = await hashPassword(p.password);
    const result = db.prepare('INSERT INTO users(username,email,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(u.username, u.email, u.name, hash, digest(code), iso());
    const user = userRow(db, result.lastInsertRowid);
    audit(db, user.id, 'auth.register', '注册了折光账号');
    return json(res, 201, {
      ...makeSession(db, req, res, user, false, production),
      recoveryCode: code
    });
  }
  if (path === '/api/auth/recovery/reset' && method === 'POST') {
    const error = passwordError(p.newPassword);
    if (error) fail(400, error);
    const user = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND recovery_hash=?').get(clean(p.email, 160), digest(clean(p.code, 40).toUpperCase()));
    if (!user || user.status !== 'active') fail(400, '邮箱或恢复码无效', 'INVALID_RECOVERY_CODE');
    const hash = await hashPassword(p.newPassword),
      code = recoveryCode();
    transaction(db, () => {
      const changed = db.prepare("UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=? AND status='active'").run(hash, digest(code), user.id, user.recovery_hash);
      if (!changed.changes) fail(400, '邮箱或恢复码无效', 'INVALID_RECOVERY_CODE');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      audit(db, user.id, 'auth.recovery', '通过恢复码重置了密码');
    });
    return json(res, 200, {
      message: '密码已更新，请重新登录。',
      recoveryCode: code
    });
  }
  if (!current) fail(401, '请先登录', 'UNAUTHENTICATED');
  const user = current.user;
  if (path === '/api/auth/logout' && method === 'POST') {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(current.session.token_hash);
    cookie(res, '', 0, production);
    return empty(res);
  }
  if (path === '/api/auth/change-password' && method === 'POST') {
    const error = passwordError(p.newPassword);
    if (error) fail(400, error);
    const old = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash;
    if (typeof p.currentPassword !== 'string' || p.currentPassword.length > 128 || !(await verifyPassword(p.currentPassword, old))) fail(400, '当前密码不正确');
    const hash = await hashPassword(p.newPassword);
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(user.id, current.session.token_hash);
      audit(db, user.id, 'auth.password', '修改了登录密码');
    });
    return json(res, 200, {
      message: '密码已更新，其他设备已退出'
    });
  }
  if (path === '/api/auth/recovery-code' && method === 'POST') {
    const old = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash;
    if (typeof p.password !== 'string' || p.password.length > 128 || !(await verifyPassword(p.password, old))) fail(400, '当前密码不正确');
    const code = recoveryCode();
    db.prepare('UPDATE users SET recovery_hash=? WHERE id=?').run(digest(code), user.id);
    audit(db, user.id, 'auth.recovery-code', '更新了账号恢复码');
    return json(res, 200, {
      recoveryCode: code
    });
  }
  if (path === '/api/profile' && method === 'PATCH') {
    db.prepare('UPDATE users SET name=?,bio=? WHERE id=?').run(required(p.name, '姓名', 80), clean(p.bio, 500), user.id);
    audit(db, user.id, 'profile.update', '更新了个人资料');
    return json(res, 200, {
      user: userRow(db, user.id)
    });
  }
  if (path === '/api/search' && method === 'GET') {
    const query = clean(url.searchParams.get('q'), 120).toLowerCase();
    const [scope, args] = visibleSql(user);
    const projects = db.prepare(`${projectSelect} WHERE ${scope} AND instr(lower(p.name || ' ' || p.description),?)>0 ORDER BY p.updated_at DESC LIMIT 8`).all(...args, query);
    const tasks = db.prepare(`SELECT t.id,t.title,t.status,t.project_id,p.name project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${scope} AND instr(lower(t.title || ' ' || t.description),?)>0 ORDER BY t.updated_at DESC LIMIT 20`).all(...args, query);
    return json(res, 200, {
      projects,
      tasks
    });
  }
  if (path === '/api/tasks' && method === 'GET') {
    const [scope, args] = visibleSql(user);
    const tasks = db.prepare(`SELECT t.*,p.name project_name,p.status project_status FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${scope} AND t.assignee_id=? ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END,COALESCE(t.due_date,'9999-12-31'),t.id DESC`).all(...args, user.id).map(t => taskView(db, t));
    return json(res, 200, {
      mine: tasks
    });
  }
  if (path === '/api/dashboard' && method === 'GET') {
    const [scope, args] = visibleSql(user);
    const projects = db.prepare(`${projectSelect} WHERE p.status='active' AND ${scope} ORDER BY p.updated_at DESC,p.id DESC`).all(...args);
    const mine = db.prepare(`SELECT t.*,p.name project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${scope} AND p.status='active' AND t.assignee_id=? AND t.status!='done' ORDER BY COALESCE(t.due_date,'9999-12-31'),CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 8`).all(...args, user.id).map(t => taskView(db, t));
    const activity = db.prepare(`SELECT a.*,u.name user_name,p.name project_name FROM activities a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN projects p ON p.id=a.project_id WHERE ${user.role === 'admin' ? '1=1' : '(a.project_id IS NULL AND a.user_id=?) OR (a.project_id IS NOT NULL AND ' + scope + ')'} ORDER BY a.id DESC LIMIT 8`).all(...(user.role === 'admin' ? [] : [user.id, ...args]));
    const announcements = db.prepare('SELECT a.*,u.name author_name FROM announcements a JOIN users u ON u.id=a.author_id ORDER BY a.pinned DESC,a.id DESC LIMIT 4').all();
    const counts = db.prepare(`SELECT COUNT(*) tasks,COALESCE(SUM(t.status='done'),0) done,COALESCE(SUM(t.assignee_id=? AND t.status!='done'),0) mine FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.status='active' AND ${scope}`).get(user.id, ...args);
    const members = db.prepare(`SELECT COUNT(DISTINCT m.user_id) n FROM project_members m JOIN projects p ON p.id=m.project_id WHERE p.status='active' AND ${scope}`).get(...args).n;
    return json(res, 200, {
      projects,
      mine,
      activity,
      announcements,
      stats: {
        projects: projects.length,
        ...counts,
        members
      }
    });
  }
  if (path === '/api/projects' && method === 'GET') {
    const [scope, args] = visibleSql(user);
    return json(res, 200, {
      projects: db.prepare(`${projectSelect} WHERE ${scope} ORDER BY p.updated_at DESC,p.id DESC`).all(...args)
    });
  }
  if (path === '/api/projects' && method === 'POST') {
    const name = required(p.name, '项目名称', 120),
      description = clean(p.description),
      c = color(p.color || '#6366f1'),
      due = date(p.due_date),
      now = iso();
    const projectId = transaction(db, () => {
      const result = db.prepare('INSERT INTO projects(name,description,color,owner_id,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(name, description, c, user.id, due, now, now);
      db.prepare('INSERT INTO project_members VALUES (?,?)').run(result.lastInsertRowid, user.id);
      audit(db, user.id, 'project.create', `创建了项目「${name}」`, result.lastInsertRowid);
      return result.lastInsertRowid;
    });
    return json(res, 201, {
      project: projectRow(db, projectId)
    });
  }
  const pm = path.match(/^\/api\/projects\/(\d+)(?:\/(members|tasks|comments|archive))?$/);
  if (pm) {
    const projectId = id(pm[1]),
      child = pm[2];
    const project = accessProject(db, user, projectId);
    const canManage = user.role === 'admin' || project.owner_id === user.id;
    if (!child && method === 'GET') return json(res, 200, {
      project,
      canManage,
      members: db.prepare(`SELECT ${fields.split(',').map(f => 'u.' + f).join(',')} FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY u.id`).all(projectId),
      tasks: db.prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY id DESC').all(projectId).map(t => taskView(db, t)),
      activity: db.prepare('SELECT a.*,u.name user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.project_id=? ORDER BY a.id DESC LIMIT 20').all(projectId)
    });
    if (child === 'tasks' && method === 'POST') {
      if (project.status === 'archived') fail(409, '请先恢复已归档的项目');
      const t = taskChanges(db, projectId, p);
      if (!t.title) fail(400, '任务标题不能为空');
      const now = iso();
      const taskId = transaction(db, () => {
        const result = db.prepare('INSERT INTO tasks(project_id,title,description,status,priority,assignee_id,creator_id,due_date,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(projectId, t.title, t.description, t.status, t.priority, t.assignee_id, user.id, t.due_date, now, now, t.status === 'done' ? now : null);
        db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now, projectId);
        audit(db, user.id, 'task.create', `创建了任务「${t.title}」`, projectId);
        return result.lastInsertRowid;
      });
      return json(res, 201, {
        task: taskView(db, db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId))
      });
    }
    if (child === 'comments' && method === 'POST') {
      if (project.status === 'archived') fail(409, '请先恢复已归档的项目');
      const taskId = id(p.task_id),
        text = required(p.body, '评论', 2000);
      if (!db.prepare('SELECT 1 FROM tasks WHERE id=? AND project_id=?').get(taskId, projectId)) fail(404, '任务不存在');
      const result = db.prepare('INSERT INTO comments(task_id,user_id,body,created_at) VALUES (?,?,?,?)').run(taskId, user.id, text, iso());
      audit(db, user.id, 'task.comment', '在任务中留下了讨论', projectId);
      return json(res, 201, {
        comment: db.prepare('SELECT c.*,u.name user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(result.lastInsertRowid)
      });
    }
    if (!canManage) fail(403, '需要项目负责人或管理员权限', 'FORBIDDEN');
    if (child === 'archive' && method === 'POST') {
      db.prepare('UPDATE projects SET status=?,updated_at=? WHERE id=?').run(project.status === 'active' ? 'archived' : 'active', iso(), projectId);
      audit(db, user.id, 'project.archive', `${project.status === 'active' ? '归档' : '恢复'}了项目「${project.name}」`, projectId);
      return json(res, 200, {
        project: projectRow(db, projectId)
      });
    }
    if (child === 'members' && method === 'POST') {
      const memberId = id(p.user_id);
      if (userRow(db, memberId)?.status !== 'active') fail(400, '成员不存在或已停用');
      db.prepare('INSERT OR IGNORE INTO project_members VALUES (?,?)').run(projectId, memberId);
      audit(db, user.id, 'project.member.add', `将「${userRow(db, memberId).name}」加入项目`, projectId);
      return empty(res);
    }
    if (child === 'members' && method === 'DELETE') {
      const memberId = id(url.searchParams.get('user_id'));
      if (memberId === project.owner_id) fail(400, '不能移除项目负责人');
      transaction(db, () => {
        db.prepare('UPDATE tasks SET assignee_id=NULL,updated_at=? WHERE project_id=? AND assignee_id=?').run(iso(), projectId, memberId);
        db.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(projectId, memberId);
        audit(db, user.id, 'project.member.remove', '移除了一位项目成员', projectId);
      });
      return empty(res);
    }
    if (!child && method === 'PATCH') {
      const name = own(p, 'name') ? required(p.name, '项目名称', 120) : project.name;
      db.prepare('UPDATE projects SET name=?,description=?,color=?,due_date=?,updated_at=? WHERE id=?').run(name, own(p, 'description') ? clean(p.description) : project.description, own(p, 'color') ? color(p.color) : project.color, own(p, 'due_date') ? date(p.due_date) : project.due_date, iso(), projectId);
      audit(db, user.id, 'project.update', `更新了项目「${name}」`, projectId);
      return json(res, 200, {
        project: projectRow(db, projectId)
      });
    }
    if (!child && method === 'DELETE') {
      transaction(db, () => {
        db.prepare('UPDATE activities SET detail=detail || ?,project_id=NULL WHERE project_id=?').run(`（原项目：${project.name}）`, projectId);
        db.prepare('DELETE FROM projects WHERE id=?').run(projectId);
        audit(db, user.id, 'project.delete', `删除了项目「${project.name}」`);
      });
      return empty(res);
    }
  }
  const tm = path.match(/^\/api\/tasks\/(\d+)$/);
  if (tm) {
    const taskId = id(tm[1]),
      task = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
    if (!task) fail(404, '任务不存在', 'NOT_FOUND');
    const project = accessProject(db, user, task.project_id);
    if (method === 'GET') return json(res, 200, {
      task: taskView(db, task),
      project,
      comments: db.prepare('SELECT c.*,u.name user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id').all(taskId),
      canDelete: user.role === 'admin' || project.owner_id === user.id || task.creator_id === user.id
    });
    if (project.status === 'archived') fail(409, '请先恢复已归档的项目');
    if (method === 'PATCH') {
      const t = taskChanges(db, task.project_id, p, task),
        now = iso();
      transaction(db, () => {
        db.prepare('UPDATE tasks SET title=?,description=?,status=?,priority=?,assignee_id=?,due_date=?,updated_at=?,completed_at=? WHERE id=?').run(t.title, t.description, t.status, t.priority, t.assignee_id, t.due_date, now, t.status === 'done' ? task.completed_at || now : null, taskId);
        db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now, task.project_id);
        audit(db, user.id, t.status !== task.status ? 'task.status' : 'task.update', `更新了任务「${t.title}」${t.status !== task.status ? ' → ' + {
          todo: '待开始',
          doing: '进行中',
          done: '已完成'
        }[t.status] : ''}`, task.project_id);
      });
      return json(res, 200, {
        task: taskView(db, db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId))
      });
    }
    if (method === 'DELETE') {
      if (user.role !== 'admin' && project.owner_id !== user.id && task.creator_id !== user.id) fail(403, '只有创建者、项目负责人或管理员可以删除任务', 'FORBIDDEN');
      transaction(db, () => {
        db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);
        audit(db, user.id, 'task.delete', `删除了任务「${task.title}」`, task.project_id);
      });
      return empty(res);
    }
  }
  if (path === '/api/users' && method === 'GET') return json(res, 200, {
    users: db.prepare(`SELECT ${fields} FROM users WHERE status='active' ORDER BY id`).all()
  });
  if (path === '/api/announcements' && method === 'GET') return json(res, 200, {
    announcements: db.prepare('SELECT a.*,u.name author_name FROM announcements a JOIN users u ON u.id=a.author_id ORDER BY a.pinned DESC,a.id DESC').all()
  });
  if (path === '/api/announcements' && method === 'POST') {
    requireAdmin(user);
    const title = required(p.title, '标题'),
      text = required(p.body, '内容', 5000),
      now = iso();
    const result = db.prepare('INSERT INTO announcements(title,body,pinned,author_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(title, text, p.pinned ? 1 : 0, user.id, now, now);
    audit(db, user.id, 'announcement.create', `发布了公告「${title}」`);
    return json(res, 201, {
      id: Number(result.lastInsertRowid)
    });
  }
  const am = path.match(/^\/api\/announcements\/(\d+)$/);
  if (am) {
    requireAdmin(user);
    const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(id(am[1]));
    if (!a) fail(404, '公告不存在');
    if (method === 'DELETE') {
      db.prepare('DELETE FROM announcements WHERE id=?').run(a.id);
      audit(db, user.id, 'announcement.delete', `删除了公告「${a.title}」`);
      return empty(res);
    }
    if (method === 'PATCH') {
      db.prepare('UPDATE announcements SET title=?,body=?,pinned=?,updated_at=? WHERE id=?').run(own(p, 'title') ? required(p.title, '标题') : a.title, own(p, 'body') ? required(p.body, '内容', 5000) : a.body, own(p, 'pinned') ? p.pinned ? 1 : 0 : a.pinned, iso(), a.id);
      audit(db, user.id, 'announcement.update', `更新了公告「${a.title}」`);
      return json(res, 200, {
        id: a.id
      });
    }
  }
  if (path.startsWith('/api/admin/')) requireAdmin(user);
  if (path === '/api/admin/overview' && method === 'GET') return json(res, 200, {
    users: db.prepare(`SELECT ${fields} FROM users ORDER BY id DESC`).all(),
    projects: db.prepare(`${projectSelect} ORDER BY p.updated_at DESC`).all(),
    activities: db.prepare('SELECT a.*,u.name user_name,p.name project_name FROM activities a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN projects p ON p.id=a.project_id ORDER BY a.id DESC LIMIT 100').all(),
    announcements: db.prepare('SELECT a.*,u.name author_name FROM announcements a JOIN users u ON u.id=a.author_id ORDER BY a.id DESC').all(),
    settings: settings(db)
  });
  if (path === '/api/admin/users' && method === 'POST') {
    const u = accountData(p),
      hash = await hashPassword(p.password);
    const result = db.prepare('INSERT INTO users(username,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)').run(u.username, u.email, u.name, hash, p.role === 'admin' ? 'admin' : 'member', iso());
    audit(db, user.id, 'user.create', `创建了成员「${u.name}」`);
    return json(res, 201, {
      user: userRow(db, result.lastInsertRowid)
    });
  }
  const um = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (um && method === 'PATCH') {
    const target = userRow(db, id(um[1]));
    if (!target) fail(404, '用户不存在');
    const role = own(p, 'role') ? choice(p.role, ['admin', 'member']) : target.role,
      status = own(p, 'status') ? choice(p.status, ['active', 'disabled']) : target.status;
    if (target.id === user.id && (status === 'disabled' || role !== 'admin')) fail(400, '不能停用自己或移除自己的管理员权限');
    if (target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status === 'disabled') && db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active'").get().n <= 1) fail(409, '必须保留至少一位可用管理员');
    transaction(db, () => {
      db.prepare('UPDATE users SET role=?,status=?,name=?,bio=? WHERE id=?').run(role, status, own(p, 'name') ? required(p.name, '姓名', 80) : target.name, own(p, 'bio') ? clean(p.bio, 500) : target.bio, target.id);
      if (status === 'disabled' || role !== target.role) db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      audit(db, user.id, 'user.update', `更新了成员「${target.name}」的资料或权限`);
    });
    return json(res, 200, {
      user: userRow(db, target.id)
    });
  }
  const reset = path.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
  if (reset && method === 'POST') {
    const target = userRow(db, id(reset[1]));
    if (!target) fail(404, '用户不存在');
    const error = passwordError(p.password);
    if (error) fail(400, error);
    const hash = await hashPassword(p.password);
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash=?,recovery_hash=NULL WHERE id=?').run(hash, target.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      audit(db, user.id, 'user.password', `重置了成员「${target.name}」的密码`);
    });
    return empty(res);
  }
  if (path === '/api/admin/settings' && method === 'PATCH') {
    transaction(db, () => {
      for (const key of ['site_name', 'site_description', 'registration_enabled']) if (own(p, key)) {
        const value = key === 'registration_enabled' ? String(choice(String(p[key]), ['true', 'false'])) : required(p[key], '设置内容', 300);
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(value, key);
      }
      audit(db, user.id, 'settings.update', '更新了工作台设置');
    });
    return json(res, 200, {
      settings: settings(db)
    });
  }
  fail(404, '接口不存在', 'NOT_FOUND');
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};
function staticFile(req, res, publicDir) {
  if (!['GET', 'HEAD'].includes(req.method)) fail(405, '请求方法不支持');
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    fail(400, '地址不正确');
  }
  if (path.includes('\0') || path.split('/').some(part => part.startsWith('.'))) fail(404, '页面不存在', 'NOT_FOUND');
  const file = path === '/' || path === '/index.html' ? resolve(publicDir, '../index.html') : join(publicDir, path);
  if (file !== resolve(publicDir, '../index.html') && (relative(publicDir, file).startsWith('..') || path.includes('\0'))) fail(404, '页面不存在');
  if (!existsSync(file) || !statSync(file).isFile()) fail(404, '页面不存在', 'NOT_FOUND');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-cache'
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}
export function createApp(db, {
  publicDir,
  production = false,
  publicOrigin
} = {}) {
  const limits = new Map();
  let lastSweep = 0;
  return async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        const origin = req.headers.origin,
          expected = publicOrigin || `http://${req.headers.host}`;
        if (origin && origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') fail(403, '不接受跨站请求', 'FORBIDDEN');
      }
      if (url.pathname.startsWith('/api/')) {
        const now = Date.now();
        if (now - lastSweep > 60000) {
          for (const [k, v] of limits) if (v.until < now) limits.delete(k);
          lastSweep = now;
        }
        const isAuth = url.pathname.startsWith('/api/auth/') && req.method === 'POST',
          key = `${req.socket.remoteAddress}:${isAuth ? 'auth' : 'api'}`;
        let limit = limits.get(key);
        if (!limit || limit.until < now) {
          limit = {
            count: 0,
            until: now + (isAuth ? 900000 : 60000)
          };
          limits.set(key, limit);
        }
        if (++limit.count > (isAuth ? 30 : 600)) {
          res.setHeader('retry-after', String(Math.ceil((limit.until - now) / 1000)));
          fail(429, '操作频繁，请稍后重试', 'RATE_LIMITED');
        }
        return await handleApi(db, req, res, url, production);
      }
      return staticFile(req, res, publicDir);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const conflict = String(error.message).includes('UNIQUE constraint');
      const status = conflict ? 409 : error.status || 500;
      if (status >= 500) console.error(error);
      json(res, status, {
        error: {
          code: conflict ? 'CONFLICT' : error.code || 'SERVER_ERROR',
          message: conflict ? '用户名或邮箱已存在' : error.status ? error.message : '服务器暂时无法完成请求'
        }
      });
    }
  };
}
