import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword, passwordError } from './security.js';
export const iso = () => new Date().toISOString();
export const publicUser = user => user && {
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  bio: user.bio,
  created_at: user.created_at
};
export async function openDatabase(path, {
  production = false,
  adminEmail,
  adminPassword
} = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), {
    recursive: true,
    mode: 0o700
  });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, recovery_hash TEXT,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      bio TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#6366f1', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      owner_id INTEGER NOT NULL REFERENCES users(id), due_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(project_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      assignee_id INTEGER REFERENCES users(id), creator_id INTEGER NOT NULL REFERENCES users(id),
      due_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0, author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
      detail TEXT NOT NULL, project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id, id);
  `);
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('site_name', '折光');
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('registration_enabled', production ? 'false' : 'true');
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('site_description', '让想法有序，让协作发生。');
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) {
    const seed = db.prepare("SELECT value FROM settings WHERE key='seed_mode'").get()?.value;
    const legacyDemo = db.prepare("SELECT 1 FROM users WHERE email='admin@zheguang.local'").get();
    if (production && (seed === 'demo' || legacyDemo)) {
      db.close();
      throw new Error('正式环境不能使用演示数据库。请将 DB_PATH 指向独立的新数据库。');
    }
    return db;
  }
  if (production && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail || '') || !adminPassword || adminPassword.length < 12 || passwordError(adminPassword))) {
    db.close();
    throw new Error('首次正式启动必须设置 ADMIN_EMAIL 和至少 12 位、包含字母和数字的 ADMIN_PASSWORD');
  }
  const adminHash = await hashPassword(adminPassword || 'Zheguang@2026');
  const memberHash = production ? null : await hashPassword('Member@2026');
  db.exec('BEGIN');
  try {
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('seed_mode', production ? 'production' : 'demo');
    const now = iso();
    const insertUser = db.prepare('INSERT INTO users (username,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)');
    insertUser.run('admin', adminEmail || 'admin@zheguang.local', production ? '管理员' : '林序', adminHash, 'admin', now);
    if (production) {
      db.exec('COMMIT');
      return db;
    }
    insertUser.run('lin', 'lin@zheguang.local', '林间', memberHash, 'member', now);
    insertUser.run('chen', 'chen@zheguang.local', '陈一', memberHash, 'member', now);
    insertUser.run('xu', 'xu@zheguang.local', '许知', memberHash, 'member', now);
    const day = offset => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const insertProject = db.prepare('INSERT INTO projects (name,description,color,owner_id,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
    const samples = [['折光 · 品牌焕新', '从视觉语言到使用体验，让每一个细节都传递一致的品牌温度。', '#6366f1', 14], ['工作台 2.0', '打磨更轻盈的协作流程，让团队把注意力放回真正重要的事情。', '#27978d', 21], ['十一月内容计划', '记录产品背后的思考，也分享一些让工作更美好的小方法。', '#d7904b', 10], ['灵感收集站', '暂时没有答案也没关系。把灵感留在这里，等待下一次相遇。', '#a274bf', 30]];
    samples.forEach((p, i) => {
      insertProject.run(p[0], p[1], p[2], 1, day(p[3]), now, now);
      for (const id of i === 3 ? [1, 2] : [1, 2, 3, 4]) db.prepare('INSERT INTO project_members VALUES (?,?)').run(i + 1, id);
    });
    const insertTask = db.prepare('INSERT INTO tasks (project_id,title,description,status,priority,assignee_id,creator_id,due_date,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,1,?,?,?,?)');
    const tasks = [[1, '整理品牌视觉参考', '收集字体、色彩与版式参考，形成第一版 moodboard。', 'done', 'medium', 2, -3], [1, '确认品牌主色与辅助色', '对比不同使用场景下的色彩可读性，整理色彩规范。', 'done', 'high', 1, -1], [1, '完成首页视觉设计', '延续轻盈、通透的视觉感受，完成桌面与移动端设计。', 'doing', 'high', 1, 0], [1, '设计组件与图标规范', '整理按钮、输入框、状态标签与基础图标。', 'doing', 'medium', 3, 2], [1, '准备品牌发布素材', '整理用于发布的图片与文案。', 'todo', 'low', 4, 7], [2, '梳理任务协作流程', '覆盖创建、分配、推进和完成的完整路径。', 'done', 'high', 1, -2], [2, '完成登录与权限接入', '验证管理员与普通成员的访问边界。', 'doing', 'high', 2, 1], [2, '工作台移动端适配', '优化侧边栏、任务看板和表单的窄屏体验。', 'todo', 'medium', 1, 3], [2, '整理第一轮体验反馈', '记录使用阻碍，按优先级排入迭代。', 'todo', 'medium', 4, 5], [3, '撰写本月产品更新', '分享近期上线的功能以及背后的思考。', 'doing', 'high', 1, -1], [3, '整理团队访谈提纲', '围绕协作方式、工具选择和灵感来源。', 'todo', 'medium', 3, 2], [3, '发布设计手记第一期', '从一张登录页开始，谈谈克制的设计。', 'done', 'low', 4, -2], [4, '收集优秀的交互细节', '随手记录值得学习的界面与交互。', 'todo', 'low', 2, 14], [4, '探索更自然的动效', '让动效帮助理解状态变化。', 'todo', 'low', 1, 20]];
    tasks.forEach(t => insertTask.run(...t.slice(0, 6), day(t[6]), now, now, t[3] === 'done' ? now : null));
    db.prepare('INSERT INTO announcements (title,body,pinned,author_id,created_at,updated_at) VALUES (?,?,1,1,?,?)').run('欢迎来到折光，让协作轻一点。', '这里是团队共同的工作空间。\n\n在「项目空间」拆解目标，在「我的任务」专注今天，在每一项任务里留下讨论与进展。\n\n先从创建你的第一个任务开始吧。', now, now);
    db.prepare('INSERT INTO announcements (title,body,pinned,author_id,created_at,updated_at) VALUES (?,?,0,1,?,?)').run('本周协作小约定', '每个任务都值得一个清晰的标题、一位负责人和一个合理的截止时间。\n完成后别忘了更新状态，让伙伴看见你的进展。', now, now);
    db.prepare('INSERT INTO activities (user_id,action,detail,project_id,created_at) VALUES (1,?,?,1,?)').run('project.create', '创建了项目「折光 · 品牌焕新」', now);
    db.prepare('INSERT INTO activities (user_id,action,detail,project_id,created_at) VALUES (2,?,?,1,?)').run('task.complete', '完成了「整理品牌视觉参考」', now);
    db.exec('COMMIT');
    return db;
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
}
