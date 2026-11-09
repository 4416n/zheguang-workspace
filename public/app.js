const state = {
  user: null,
  csrf: '',
  view: 'dashboard',
  detailId: null,
  data: null,
  loading: false,
  config: {},
  filter: 'all',
  search: '',
  request: 0,
  dialog: null
};
const $ = selector => document.querySelector(selector);
const app = $('#app');
const icon = (name, cls = '') => {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    layers: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
    check: '<path d="m5 12 4.2 4L19 6"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1-1.6 2.8-.2-.1a2 2 0 0 0-3 1.7v.2h-3.3v-.2a2 2 0 0 0-3-1.7l-.2.1-1.6-2.8.1-.1a2 2 0 0 0-1-3.4h-.2V8.3h.2a2 2 0 0 0 1-3.4l-.1-.1 1.6-2.8.2.1a2 2 0 0 0 3-1.7V.2h3.3v.2a2 2 0 0 0 3 1.7l.2-.1 1.6 2.8-.1.1a2 2 0 0 0 1 3.4h.2v3.3h-.2a2 2 0 0 0-1 3.4Z" transform="scale(.78) translate(3.3 3.3)"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5m7 7-7-7 7-7"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M20 19V5a2 2 0 0 0-2-2h-5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    user: '<circle cx="12" cy="8" r="3.3"/><path d="M5 20c1.4-3.5 3.7-5 7-5s5.6 1.5 7 5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>'
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
};
const safe = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
})[ch]);
const initials = name => safe(String(name || '?').trim().slice(0, 2));
const dateText = value => value ? new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric'
}).format(new Date(`${value}T12:00:00`)) : '未设置';
const timeAgo = value => {
  const d = Date.now() - new Date(value).getTime();
  if (d < 60000) return '刚刚';
  if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`;
  return `${Math.floor(d / 86400000)} 天前`;
};
const statusLabel = s => ({
  todo: '待开始',
  doing: '进行中',
  done: '已完成'
})[s] || s;
const priorityLabel = p => ({
  low: '低优先级',
  medium: '中优先级',
  high: '高优先级'
})[p] || p;
const avatarClass = id => ['', '', 'teal', 'amber', 'rose'][Number(id) % 5] || '';
async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    ...(options.body ? {
      'content-type': 'application/json'
    } : {}),
    ...(options.headers || {})
  };
  if (state.csrf && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) headers['x-csrf-token'] = state.csrf;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    method,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  let data = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null;
      state.csrf = '';
      closeModal();
      renderLogin();
    }
    throw new Error(data?.error?.message || '请求失败');
  }
  return data;
}
function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'error' : ''}`;
  node.textContent = message;
  $('#toast-stack').append(node);
  setTimeout(() => node.remove(), 3400);
}
function setLoading(isLoading) {
  state.loading = isLoading;
  if (isLoading) app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}
function renderLogin() {
  state.view = 'dashboard';
  state.data = null;
  state.detailId = null;
  app.innerHTML = `<main class="login-page"><div class="login-grain"></div><div class="light-ribbon" aria-hidden="true"></div><div class="login-layout">
    <section class="login-copy"><div class="eyebrow">01 / ENTER</div><div class="brand-mark"><span class="mark">${icon('layers')}</span><strong>${safe(state.config.site_name || '折光')}</strong><span>项目与任务工作台</span></div><h1>欢迎回来<br><em>只开一扇门</em></h1><p>让想法有序，让协作发生。把目标放进项目，把今天留给真正重要的事情。</p><div class="login-note"><i></i> 工作台已准备好，等你回来</div></section>
    <div class="login-card-wrap"><section class="login-card"><aside class="ticket-edge"><span>入场券</span><small>NO.01</small></aside><form id="login-form" class="login-form"><h2>登录</h2><p class="sub">工作台只认这一次</p><label class="form-field"><span>账号</span><div class="input-wrap">${icon('user')}<input class="input" name="account" autocomplete="username" placeholder="邮箱或用户名" required></div><p class="error-text"></p></label><label class="form-field"><span>密码<a href="#" data-action="recovery">忘记密码</a></span><div class="input-wrap">${icon('lock')}<input class="input" name="password" type="password" autocomplete="current-password" placeholder="输入密码" required></div><p class="error-text"></p></label><label class="remember"><input type="checkbox" name="remember"> 30 天内保持登录</label><button class="button-primary" type="submit"><span>进入折光</span>${icon('arrow')}</button><p class="login-foot">${state.config.registration_enabled ? '还没有账号？ <a href="#" data-action="register">创建账号</a>' : '账号由管理员开通'}</p>${state.config.demo ? '<div class="demo-hint">本地演示 · <button type="button" data-action="demo-login">填入管理员账号 ↗</button><br>admin / Zheguang@2026<br>成员 lin / Member@2026</div>' : ''}</form></section></div>
  </div></main>`;
}
function sidebar() {
  const isAdmin = state.user.role === 'admin';
  const items = [['dashboard', '总览', 'grid'], ['projects', '项目空间', 'layers'], ['tasks', '我的任务', 'check'], ['announcements', '公告栏', 'bell']];
  return `<aside class="sidebar" id="sidebar"><div class="side-brand"><span class="mark">${icon('layers')}</span><strong>${safe(state.config.site_name || '折光')}</strong></div><div class="side-caption">WORKSPACE / 01</div><div class="nav-label">工作台</div><nav class="nav">${items.map(([view, label, ico]) => `<button class="nav-button ${state.view === view || view === 'projects' && state.view === 'project' ? 'active' : ''}" data-action="navigate" data-view="${view}">${icon(ico)}<span>${label}</span>${view === 'tasks' && state.data?.stats?.mine ? `<small class="nav-count">${state.data.stats.mine}</small>` : ''}</button>`).join('')}</nav>${isAdmin ? `<div class="nav-label" style="margin-top:27px">管理</div><nav class="nav"><button class="nav-button ${state.view === 'admin' ? 'active' : ''}" data-action="navigate" data-view="admin">${icon('users')}<span>管理后台</span></button></nav>` : ''}<div class="side-spacer"></div><div class="side-tip"><strong>${icon('spark')} 今天的提示</strong>先把最小的一步写下来。清晰，常常从一个好标题开始。</div><div class="side-user"><span class="avatar ${avatarClass(state.user.id)}">${initials(state.user.name)}</span><div><b>${safe(state.user.name)}</b><small>${state.user.role === 'admin' ? '管理员' : '协作成员'}</small></div><button class="icon-button" data-action="user-menu" aria-label="账户设置">${icon('settings')}</button></div></aside>`;
}
function topbar() {
  return `<header class="topbar"><button class="mobile-menu" data-action="toggle-sidebar" aria-label="打开导航">${icon('menu')}</button><div class="crumb">${safe(state.config.site_name || '折光')} / <b>${{
    dashboard: '总览',
    projects: '项目空间',
    project: '项目看板',
    tasks: '我的任务',
    announcements: '公告栏',
    admin: '管理后台',
    settings: '账户设置'
  }[state.view] || '工作台'}</b></div><div class="top-actions"><label class="search">${icon('search')}<input id="global-search" placeholder="搜索项目与任务…" aria-label="搜索项目与任务" autocomplete="off" readonly data-action="search"></label><button class="button-small primary" data-action="create-task">${icon('plus')}<span>新建任务</span></button><button class="icon-button" data-action="open-notices" aria-label="公告">${icon('bell')}</button></div></header>`;
}
function renderShell(content) {
  app.innerHTML = `<div class="app-shell">${sidebar()}<main class="main">${topbar()}<div class="page-content">${content}</div><footer class="workspace-footer"><span>${safe(state.config.site_name || '折光')} · 留一点空间，让好想法发生。</span><span><i></i> 已连接工作空间</span></footer></main><button class="mobile-scrim" aria-label="关闭导航" data-action="toggle-sidebar"></button></div>`;
}
function statCard(label, value, meta, color, dot) {
  return `<article class="stat-card stagger" style="--stat-color:${color};--stat-dot:${dot || color}"><span class="stat-label">${label}</span><div class="stat-num">${value}</div><div class="stat-meta"><i class="stat-dot"></i>${meta}</div></article>`;
}
function renderDashboard(data) {
  const projects = data.projects || [];
  const tasks = data.mine || [];
  const projectCards = projects.slice(0, 4).map(p => `<article class="project-card" data-action="open-project" data-id="${p.id}" tabindex="0" role="button" style="--project-color:${safe(p.color)}"><span class="eyebrow" style="font-size:9px;letter-spacing:.12em">PROJECT / ${String(p.id).padStart(2, '0')}</span><h3>${safe(p.name)}</h3><p>${safe(p.description)}</p><div class="progress"><i style="width:${p.task_count ? Math.round(p.done_count / p.task_count * 100) : 0}%"></i></div><div class="project-meta"><span>${p.done_count}/${p.task_count} 项完成</span><span>${p.member_count} 位成员</span></div></article>`).join('') || '<div class="empty-state"><div><strong>还没有项目</strong>创建一个项目，开始组织你的想法。</div></div>';
  const taskRows = tasks.slice(0, 6).map(t => `<div class="task-row"><button class="task-check ${t.status === 'done' ? 'done' : ''}" data-action="toggle-task" data-id="${t.id}" aria-label="完成任务">${t.status === 'done' ? icon('check') : ''}</button><div class="task-info"><button class="task-title ${t.status === 'done' ? 'done' : ''}" data-action="task-detail" data-id="${t.id}">${safe(t.title)}</button><span class="task-project">${safe(t.project_name)} · ${t.assignee?.name === state.user.name ? '你' : safe(t.assignee?.name || '未分配')}</span></div><span class="priority ${t.priority}"><i></i>${priorityLabel(t.priority).replace('优先级', '')}</span></div>`).join('') || '<div class="empty-state"><div><strong>今天很轻</strong>暂时没有待处理的任务。</div></div>';
  const activities = (data.activity || []).slice(0, 5).map(a => `<div class="activity-row"><span class="activity-avatar">${initials(a.user_name)}</span><div class="activity-copy"><p><b>${safe(a.user_name || '系统')}</b> ${safe(a.detail)}</p><time>${timeAgo(a.created_at)}${a.project_name ? ` · ${safe(a.project_name)}` : ''}</time></div></div>`).join('') || '<div class="empty-state">还没有动态</div>';
  const announcements = (data.announcements || []).slice(0, 3).map(a => `<article class="announcement"><h3>${safe(a.title)}${a.pinned ? '<span class="pin">置顶</span>' : ''}</h3><p>${safe(a.body)}</p></article>`).join('') || '<div class="empty-state">还没有公告</div>';
  const percent = data.stats?.tasks ? Math.round(data.stats.done / data.stats.tasks * 100) : 0;
  renderShell(`<div class="content-head"><div><div class="eyebrow">${new Date().toLocaleDateString('zh-CN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })}</div><h1>${new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好'}，${safe(state.user.name)}。</h1><p>今天也让事情，沿着它该有的方向发生。</p></div><div class="head-actions"><button class="button-small" data-action="create-project">${icon('plus')} 新建项目</button></div></div><section class="flow-banner stagger"><div><span class="eyebrow">A LITTLE SPACE, A LOT OF POSSIBILITY</span><h2>把想法，变成下一步。</h2><p>${safe(state.config.site_description || '让想法有序，让协作发生。')}</p><button class="button-small" data-action="create-project">开启一个新计划 ${icon('arrow')}</button></div><div class="prism" aria-hidden="true"><i></i><i></i><i></i><i></i><span>REFRACT / 01</span></div></section><div class="stats-grid"><div class="stagger">${statCard('进行中的项目', projects.length, '个空间正在推进', '#e8e7ff', '#635cf3')}</div><div class="stagger delay-1">${statCard('待办任务', data.stats?.mine || 0, `分配给你的下一步`, '#e2f4f0', '#268f85')}</div><div class="stagger delay-2">${statCard('完成进度', `${percent}%`, `${data.stats?.done || 0} / ${data.stats?.tasks || 0} 项已完成`, '#f8edde', '#d38b42')}</div><div class="stagger delay-3">${statCard('协作成员', data.stats?.members || 0, '正在和你一起工作', '#f6e8ef', '#bd6382')}</div></div><div class="section-grid"><section class="panel stagger delay-1"><div class="panel-head"><h2>项目空间</h2><button data-action="navigate" data-view="projects">查看全部 ${icon('arrow')}</button></div><div class="project-grid">${projectCards}</div></section><section class="panel stagger delay-2"><div class="panel-head"><h2>我的任务</h2><button data-action="navigate" data-view="tasks">全部任务 ${icon('arrow')}</button></div><div class="task-list">${taskRows}</div></section></div><div class="section-grid"><section class="panel stagger delay-2"><div class="panel-head"><h2>最近动态</h2><span class="eyebrow" style="font-size:9px;letter-spacing:.1em">RECENT ACTIVITY</span></div><div class="activity-list">${activities}</div></section><section class="panel stagger delay-3"><div class="panel-head"><h2>公告</h2><button data-action="navigate" data-view="announcements">查看全部 ${icon('arrow')}</button></div><div class="announcement-list">${announcements}</div></section></div>`);
}
function renderProjects(data) {
  const all = data.projects || [];
  const projects = all.filter(p => state.filter === 'archived' ? p.status === 'archived' : p.status === 'active');
  const cards = projects.map((p, i) => `<article class="project-card stagger delay-${Math.min(i % 4 + 1, 4)}" data-action="open-project" data-id="${p.id}" tabindex="0" role="button" style="--project-color:${safe(p.color)}"><span class="eyebrow" style="font-size:9px;letter-spacing:.12em">PROJECT / ${String(p.id).padStart(2, '0')}</span><h3>${safe(p.name)}</h3><p>${safe(p.description)}</p><div class="progress"><i style="width:${p.task_count ? Math.round(p.done_count / p.task_count * 100) : 0}%"></i></div><div class="project-meta"><span>${p.done_count}/${p.task_count} 项完成</span><span>${dateText(p.due_date)} 截止</span></div><div class="project-meta"><span>${p.member_count} 位成员</span><span>${safe(p.owner_name)}</span></div></article>`).join('');
  renderShell(`<div class="content-head"><div><div class="eyebrow">SPACES / ${String(projects.length).padStart(2, '0')}</div><h1>项目空间</h1><p>每个目标，都有一块自己的桌面。</p></div><div class="head-actions"><button class="button-small primary" data-action="create-project">${icon('plus')} 新建项目</button></div></div><div class="project-toolbar"><div class="view-switch"><button data-action="filter" data-filter="all" class="${state.filter !== 'archived' ? 'active' : ''}">进行中 ${all.filter(p => p.status === 'active').length}</button><button data-action="filter" data-filter="archived" class="${state.filter === 'archived' ? 'active' : ''}">已归档 ${all.filter(p => p.status === 'archived').length}</button></div><span class="muted">${projects.length} 个空间</span></div><div class="project-grid" style="padding:0;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:15px">${cards || '<div class="panel empty-state"><div><strong>还没有项目</strong>创建一个项目，开始组织你的想法。</div></div>'}</div>`);
}
function renderTasks(data) {
  const all = data.mine || [];
  const tasks = all.filter(t => state.filter === 'done' ? t.status === 'done' : state.filter === 'high' ? t.priority === 'high' && t.status !== 'done' : state.filter === 'all' || t.status === state.filter);
  const rows = tasks.map(t => `<article class="panel task-row" style="padding:0 18px;margin-bottom:8px;border-radius:14px;cursor:pointer" data-action="task-detail" data-id="${t.id}"><button class="task-check ${t.status === 'done' ? 'done' : ''}" data-action="toggle-task" data-id="${t.id}" aria-label="${t.status === 'done' ? '重新打开任务' : '完成任务'}" ${t.project_status === 'archived' ? 'disabled' : ''}>${t.status === 'done' ? icon('check') : ''}</button><div class="task-info"><button class="task-title ${t.status === 'done' ? 'done' : ''}" data-action="task-detail" data-id="${t.id}">${safe(t.title)}</button><span class="task-project">${safe(t.project_name)} · ${t.assignee?.name === state.user.name ? '分配给你' : safe(t.assignee?.name || '未分配')}</span></div><span class="priority ${t.priority}"><i></i>${priorityLabel(t.priority)}</span><span style="color:#aaa6b4;font-size:10px">${dateText(t.due_date)}</span></article>`).join('');
  renderShell(`<div class="content-head"><div><div class="eyebrow">FOCUS / TODAY</div><h1>我的任务</h1><p>把注意力留给下一步，完成会自己发生。</p></div><div class="head-actions"><button class="button-small primary" data-action="create-task">${icon('plus')} 新建任务</button></div></div><div class="project-toolbar"><div class="view-switch">${[['all', '全部'], ['todo', '待开始'], ['doing', '进行中'], ['done', '已完成'], ['high', '高优先级']].map(([f, l]) => `<button class="${state.filter === f ? 'active' : ''}" data-action="filter" data-filter="${f}">${l}</button>`).join('')}</div><span class="muted">${tasks.length} 项任务</span></div><div class="panel" style="padding:15px">${rows || '<div class="empty-state"><div><strong>任务清空了</strong>去项目空间添加一项下一步。</div></div>'}</div>`);
}
function renderAnnouncements(data) {
  const items = data.announcements || [];
  const cards = items.map(a => `<article class="panel announcement stagger" style="padding:20px 22px;margin-bottom:11px"><div style="display:flex;align-items:center;gap:8px"><span class="avatar ${avatarClass(a.author_id)}">${initials(a.author_name)}</span><div><h3 style="font-size:13px">${safe(a.title)}${a.pinned ? '<span class="pin">置顶</span>' : ''}</h3><small style="color:#aaa6b5;font-size:9px">${safe(a.author_name)} · ${timeAgo(a.updated_at)}</small></div></div><p style="margin:15px 0 0;white-space:pre-line;font-size:11px;line-height:1.9;-webkit-line-clamp:unset">${safe(a.body)}</p>${state.user.role === 'admin' ? `<div class="form-actions"><button class="button-small" data-action="edit-announcement" data-id="${a.id}">编辑</button><button class="button-small button-danger" data-action="delete-announcement" data-id="${a.id}">删除</button></div>` : ''}</article>`).join('');
  renderShell(`<div class="content-head"><div><div class="eyebrow">NOTES / TEAM</div><h1>公告栏</h1><p>让重要的事情，有一个被看见的地方。</p></div>${state.user.role === 'admin' ? `<div class="head-actions"><button class="button-small primary" data-action="create-announcement">${icon('plus')} 发布公告</button></div>` : ''}</div><div style="max-width:760px">${cards || '<div class="panel empty-state">还没有公告</div>'}</div>`);
}
function renderProjectDetail(data) {
  const p = data.project;
  const members = data.members || [];
  const taskBy = s => data.tasks.filter(t => t.status === s);
  const columns = [['todo', '待开始'], ['doing', '进行中'], ['done', '已完成']];
  const cards = s => taskBy(s).map((t, i) => `<article class="task-card ${t.status === 'done' ? 'done' : ''}" draggable="${p.status !== 'archived'}" data-task-id="${t.id}" data-action="task-detail" data-id="${t.id}" tabindex="0" role="button" style="animation-delay:${i * 45}ms"><button class="icon-button card-menu" data-action="task-detail" aria-label="查看任务" data-id="${t.id}">${icon('more')}</button><h3>${safe(t.title)}</h3>${t.description ? `<p>${safe(t.description)}</p>` : ''}<div class="task-card-foot"><span class="mini-avatar ${avatarClass(t.assignee_id)}" title="${safe(t.assignee?.name || '未分配')}">${initials(t.assignee?.name)}</span>${t.due_date ? `<span class="date">${dateText(t.due_date)}</span>` : ''}<span class="task-tag ${t.priority}">${priorityLabel(t.priority).replace('优先级', '')}</span></div></article>`).join('');
  const avatars = members.slice(0, 5).map(m => `<span class="avatar ${avatarClass(m.id)}" title="${safe(m.name)}">${initials(m.name)}</span>`).join('');
  renderShell(`<div class="project-detail-head"><button class="back-button" aria-label="返回项目列表" data-action="navigate" data-view="projects">${icon('back')}</button><span class="project-color" style="--project-color:${safe(p.color)}"></span><div><h1>${safe(p.name)}</h1><p>${safe(p.description)}</p></div><div class="head-avatars">${avatars}</div>${p.status === 'active' ? `<button class="button-small primary" data-action="create-task">${icon('plus')} 新任务</button>` : '<span class="status-badge off">已归档</span>'}</div><div class="project-toolbar"><span class="eyebrow" style="font-size:9px;letter-spacing:.12em">${p.done_count}/${p.task_count} COMPLETED · ${members.length} MEMBERS</span><div class="head-actions">${data.canManage ? `<button class="button-small" data-action="project-settings">${icon('settings')} 项目设置</button><button class="button-small" data-action="archive-project">${p.status === 'active' ? '归档项目' : '恢复项目'}</button>` : ''}</div></div><section class="kanban">${columns.map(([s, label]) => `<div class="kanban-col" data-status="${s}"><div class="kanban-col-head"><b>${label}</b><span class="kanban-count">${taskBy(s).length}</span></div><div class="kanban-cards">${cards(s)}</div>${p.status === 'active' ? `<button class="kanban-add" data-action="create-task" data-status="${s}">${icon('plus')} 添加任务</button>` : ''}</div>`).join('')}</section><div class="section-grid" style="margin-top:20px"><section class="panel"><div class="panel-head"><h2>项目动态</h2></div><div class="activity-list">${(data.activity || []).slice(0, 8).map(a => `<div class="activity-row"><span class="activity-avatar">${initials(a.user_name)}</span><div class="activity-copy"><p><b>${safe(a.user_name || '系统')}</b> ${safe(a.detail)}</p><time>${timeAgo(a.created_at)}</time></div></div>`).join('') || '<div class="empty-state">还没有动态</div>'}</div></section><section class="panel"><div class="panel-head"><h2>项目成员</h2>${data.canManage ? '<button data-action="manage-members">管理</button>' : ''}</div><div class="activity-list">${members.map(m => `<div class="activity-row"><span class="avatar ${avatarClass(m.id)}">${initials(m.name)}</span><div class="activity-copy"><p><b>${safe(m.name)}</b> ${m.id === p.owner_id ? '项目负责人' : '协作成员'}</p><time>${safe(m.email)}</time></div></div>`).join('')}</div></section></div>`);
}
function renderAdmin(data) {
  const users = data.users || [];
  const activities = data.activities || [];
  const settings = data.settings || {};
  const rows = users.map(u => `<tr><td><div class="user-cell"><span class="avatar ${avatarClass(u.id)}">${initials(u.name)}</span><span><b style="display:block;color:#5a566c;font-size:10px">${safe(u.name)}</b><small style="color:#aaa6b6;font-size:9px">@${safe(u.username)}</small></span></div></td><td>${safe(u.email)}</td><td><span class="role-badge">${u.role === 'admin' ? '管理员' : '成员'}</span></td><td><span class="status-badge ${u.status === 'disabled' ? 'off' : ''}">${u.status === 'active' ? '正常' : '已停用'}</span></td><td><div class="table-actions"><button class="button-small" data-action="edit-user" data-id="${u.id}">编辑</button><button class="button-small" data-action="admin-password" data-id="${u.id}">重置密码</button></div></td></tr>`).join('');
  const acts = activities.map(a => `<div class="activity-row"><span class="activity-avatar">${initials(a.user_name)}</span><div class="activity-copy"><p><b>${safe(a.user_name || '系统')}</b> ${safe(a.detail)}</p><time>${timeAgo(a.created_at)}${a.project_name ? ` · ${safe(a.project_name)}` : ''}</time></div></div>`).join('');
  renderShell(`<div class="content-head"><div><div class="eyebrow">CONTROL ROOM / 01</div><h1>管理后台</h1><p>把团队、内容与规则放在同一个清晰的界面里。</p></div><div class="head-actions"><button class="button-small" data-action="create-announcement">${icon('bell')} 发布公告</button><button class="button-small primary" data-action="create-user">${icon('plus')} 添加成员</button></div></div><div class="stats-grid"><div class="stagger">${statCard('用户总数', users.length, '包含管理员与成员', '#e8e7ff', '#635cf3')}</div><div class="stagger delay-1">${statCard('活跃用户', users.filter(u => u.status === 'active').length, '可以正常进入工作台', '#e2f4f0', '#268f85')}</div><div class="stagger delay-2">${statCard('项目总数', (data.projects || []).length, '所有工作空间', '#f8edde', '#d38b42')}</div><div class="stagger delay-3">${statCard('操作记录', activities.length, '最近活动已留档', '#f6e8ef', '#bd6382')}</div></div><div class="admin-grid" style="margin-top:20px"><section class="panel"><div class="panel-head"><h2>成员管理</h2><span class="eyebrow" style="font-size:9px">${users.length} ACCOUNTS</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>成员</th><th>邮箱</th><th>角色</th><th>状态</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>系统设置</h2></div><form id="settings-form" class="admin-form"><label>工作台名称<input name="site_name" value="${safe(settings.site_name || '折光')}"></label><label>工作台描述<textarea name="site_description">${safe(settings.site_description || '')}</textarea></label><label>开放注册<select name="registration_enabled"><option value="true" ${settings.registration_enabled === 'true' ? 'selected' : ''}>允许</option><option value="false" ${settings.registration_enabled !== 'true' ? 'selected' : ''}>关闭</option></select></label><div class="form-actions"><button class="button-small primary" type="submit">保存设置</button></div></form></section></div><section class="panel" style="margin-top:19px"><div class="panel-head"><h2>全部项目</h2><span class="muted">${(data.projects || []).length} 个项目</span></div><div class="admin-project-list">${(data.projects || []).map(p => `<div class="admin-project-row"><span>${safe(p.name)}<small>${safe(p.owner_name)} · ${p.task_count} 项任务 · ${p.status === 'active' ? '进行中' : '已归档'}</small></span><button class="button-small" data-action="open-project" data-id="${p.id}">打开项目</button></div>`).join('') || '<p class="muted">还没有项目</p>'}</div></section><section class="panel" style="margin-top:19px"><div class="panel-head"><h2>操作记录</h2><span class="eyebrow" style="font-size:9px">AUDIT LOG</span></div><div class="activity-list" style="max-height:420px;overflow-y:auto">${acts || '<div class="empty-state">还没有记录</div>'}</div></section>`);
}
function renderSettings() {
  renderShell(`<div class="content-head"><div><div class="eyebrow">ACCOUNT / PRIVATE</div><h1>账户设置</h1><p>管理个人资料与账号安全。</p></div><button class="button-small" data-action="logout">${icon('logout')} 退出登录</button></div><div class="admin-grid"><section class="panel"><div class="panel-head"><h2>个人资料</h2></div><form id="profile-form" class="admin-form"><label>姓名<input name="name" value="${safe(state.user.name)}"></label><label>邮箱<input value="${safe(state.user.email)}" disabled></label><label>个人简介<textarea name="bio">${safe(state.user.bio || '')}</textarea></label><div class="form-actions"><button class="button-small primary" type="submit">保存资料</button></div></form></section><section class="panel"><div class="panel-head"><h2>修改密码</h2></div><form id="password-form" class="admin-form"><label>当前密码<input type="password" name="currentPassword" required></label><label>新密码<input type="password" name="newPassword" required placeholder="至少 10 位，含字母和数字"></label><div class="form-actions"><button class="button-small primary" type="submit">更新密码</button></div></form><div class="admin-form"><button class="button-small" data-action="recovery-code">生成账号恢复码</button><p class="muted">妥善保存恢复码，可在忘记密码时恢复账号。</p></div></section></div>`);
}
async function loadView() {
  if (!state.user) return renderLogin();
  const request = ++state.request;
  const view = state.view;
  if (!$('.app-shell')) setLoading(true);else document.body.classList.add('page-loading');
  try {
    const endpoints = {
      dashboard: '/api/dashboard',
      tasks: '/api/tasks',
      projects: '/api/projects',
      project: `/api/projects/${state.detailId}`,
      announcements: '/api/announcements',
      admin: '/api/admin/overview'
    };
    const data = endpoints[view] ? await api(endpoints[view]) : null;
    if (request !== state.request || !state.user) return;
    state.data = data;
    state.loading = false;
    if (state.view === 'dashboard') renderDashboard(state.data);else if (state.view === 'projects') renderProjects(state.data);else if (state.view === 'tasks') renderTasks(state.data);else if (state.view === 'project') renderProjectDetail(state.data);else if (state.view === 'announcements') renderAnnouncements(state.data);else if (state.view === 'admin') renderAdmin(state.data);else if (state.view === 'settings') renderSettings();
  } catch (e) {
    if (request !== state.request) return;
    state.loading = false;
    toast(e.message, 'error');
    if (state.user) renderShell('<div class="panel empty-state"><div><strong>页面暂时无法加载</strong><button class="button-small" data-action="retry">重新加载</button></div></div>');
  } finally {
    if (request === state.request) document.body.classList.remove('page-loading');
  }
}
function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}
function openModal(content) {
  state.lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="操作对话框">${content}</section></div>`;
  $('#modal-root').querySelectorAll('button:not([type])').forEach(b => b.type = 'button');
  app.inert = true;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ($('.modal input:not([type=checkbox])') || $('.modal textarea') || $('.modal button'))?.focus());
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  app.inert = false;
  state.searchRequest = (state.searchRequest || 0) + 1;
  document.body.style.overflow = '';
  state.lastFocus?.focus();
}
function modalForm(title, subtitle, body, submitLabel = '保存') {
  return `<div class="modal-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button" aria-label="关闭对话框" data-action="close-modal">${icon('back')}</button></div>${body}<div class="modal-footer"><button class="button-ghost" data-action="close-modal">取消</button><button class="button-small primary" type="submit">${submitLabel}</button></div>`;
}
function openCreateProject() {
  openModal(`<form id="project-form">${modalForm('创建项目', '给一个目标一个可以被看见的空间。', `<div class="modal-body"><label class="form-field"><span>项目名称</span><input class="input" name="name" placeholder="例如：春季发布计划" required></label><label class="form-field"><span>项目描述</span><textarea name="description" placeholder="描述这个项目希望完成什么"></textarea></label><div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="form-field"><span>项目颜色</span><input class="input" style="padding-left:12px" type="color" name="color" value="#635cf3"></label><label class="form-field"><span>截止日期</span><input class="input" style="padding-left:12px" type="date" name="due_date"></label></div></div>`)} </form>`);
}
function openRecovery() {
  openModal(`<form id="reset-form">${modalForm('找回账号', '使用注册时保存的恢复码重设密码。没有恢复码时，请联系管理员重置。', `<div class="modal-body"><label class="form-field"><span>注册邮箱</span><input class="input" type="email" name="email" required></label><label class="form-field"><span>账号恢复码</span><input class="input" name="code" placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX" required></label><label class="form-field"><span>新密码</span><input class="input" name="newPassword" type="password" minlength="10" required placeholder="至少 10 位，包含字母和数字"></label></div>`, '重设密码')}</form>`);
}
function openCreateUser() {
  openModal(`<form id="user-form">${modalForm('添加成员', '给团队邀请一位新的协作者。', `<div class="modal-body"><div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="form-field"><span>用户名</span><input class="input" style="padding-left:12px" name="username" required></label><label class="form-field"><span>姓名</span><input class="input" style="padding-left:12px" name="name" required></label></div><label class="form-field"><span>邮箱</span><input class="input" style="padding-left:12px" type="email" name="email" required></label><label class="form-field"><span>初始密码</span><input class="input" style="padding-left:12px" type="password" name="password" placeholder="至少 10 位，含字母和数字" required></label><label class="form-field"><span>角色</span><select name="role"><option value="member">成员</option><option value="admin">管理员</option></select></label></div>`)} </form>`);
}
function openAnnouncement() {
  openModal(`<form id="announcement-form">${modalForm('发布公告', '把需要被团队看见的事情写下来。', `<div class="modal-body"><label class="form-field"><span>标题</span><input class="input" style="padding-left:12px" name="title" required></label><label class="form-field"><span>内容</span><textarea name="body" placeholder="可以写更新、提醒或一个小约定" required></textarea></label><label class="remember"><input type="checkbox" name="pinned"> 置顶这条公告</label></div>`, '发布')}</form>`);
}
async function openUserEdit(id) {
  const user = state.data.users.find(u => u.id === Number(id));
  if (!user) return;
  openModal(`<form id="edit-user-form" data-id="${user.id}">${modalForm('编辑成员', `更新 ${safe(user.name)} 的访问权限。`, `<div class="modal-body"><label class="form-field"><span>姓名</span><input class="input" style="padding-left:12px" name="name" value="${safe(user.name)}"></label><label class="form-field"><span>个人简介</span><textarea name="bio">${safe(user.bio || '')}</textarea></label><label class="form-field"><span>角色</span><select name="role"><option value="member" ${user.role === 'member' ? 'selected' : ''}>成员</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option></select></label><label class="form-field"><span>状态</span><select name="status"><option value="active" ${user.status === 'active' ? 'selected' : ''}>正常</option><option value="disabled" ${user.status === 'disabled' ? 'selected' : ''}>停用</option></select></label></div>`, '保存')}</form>`);
}
async function route(view, detailId = null) {
  closeModal();
  state.view = view;
  state.detailId = detailId;
  state.filter = 'all';
  const hash = view === 'project' ? `#project/${detailId}` : `#${view}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  await loadView();
}
async function onSubmit(form) {
  if (await extraSubmit(form)) return;
  if (form.id === 'login-form') {
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.querySelector('span').textContent = '正在进入';
    try {
      const d = await api('/api/auth/login', {
        method: 'POST',
        body: formObject(form)
      });
      state.user = d.user;
      state.csrf = d.csrfToken;
      toast(`欢迎回来，${state.user.name}`);
      await route('dashboard');
    } catch (e) {
      form.querySelectorAll('.input').forEach(input => {
        input.classList.add('invalid');
      });
      toast(e.message, 'error');
      btn.disabled = false;
      btn.querySelector('span').textContent = '进入折光';
    }
    return;
  }
  try {
    if (form.id === 'project-form') {
      await api('/api/projects', {
        method: 'POST',
        body: formObject(form)
      });
      toast('项目已创建');
      await route('projects');
    } else if (form.id === 'task-form') {
      const data = formObject(form);
      const pid = data.project_id;
      await api(`/api/projects/${pid}/tasks`, {
        method: 'POST',
        body: data
      });
      toast('任务已创建');
      closeModal();
      if (state.view === 'project' && Number(state.detailId) === Number(pid)) await loadView();else await route('project', pid);
    } else if (form.id === 'reset-form') {
      const d = await api('/api/auth/recovery/reset', {
        method: 'POST',
        body: formObject(form)
      });
      state.user = null;
      state.csrf = '';
      renderLogin();
      showRecoveryCode(d.recoveryCode, '密码已重置。旧恢复码已失效，请保存新的恢复码。');
    } else if (form.id === 'user-form') {
      await api('/api/admin/users', {
        method: 'POST',
        body: formObject(form)
      });
      toast('成员已添加');
      closeModal();
      await loadView();
    } else if (form.id === 'announcement-form') {
      await api('/api/announcements', {
        method: 'POST',
        body: formObject(form)
      });
      toast('公告已发布');
      closeModal();
      if (state.view === 'admin' || state.view === 'announcements') await loadView();
    } else if (form.id === 'edit-user-form') {
      const d = await api(`/api/admin/users/${form.dataset.id}`, {
        method: 'PATCH',
        body: formObject(form)
      });
      if (d.user.id === state.user.id) state.user = d.user;
      toast('成员信息已更新');
      closeModal();
      await loadView();
    } else if (form.id === 'settings-form') {
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: formObject(form)
      });
      state.config = await api('/api/config');
      toast('设置已保存');
      await loadView();
    } else if (form.id === 'profile-form') {
      const data = formObject(form);
      const d = await api('/api/profile', {
        method: 'PATCH',
        body: data
      });
      state.user = {
        ...state.user,
        ...d.user
      };
      toast('资料已保存');
      await route('settings');
    } else if (form.id === 'password-form') {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: formObject(form)
      });
      form.reset();
      toast('密码已更新，其他设备已退出');
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function toggleTask(id) {
  const task = (state.data?.mine || []).find(t => t.id === Number(id));
  if (!task) return;
  try {
    await api(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: {
        status: task.status === 'done' ? 'todo' : 'done'
      }
    });
    toast(task.status === 'done' ? '任务已重新打开' : '任务已完成');
    await loadView();
  } catch (e) {
    toast(e.message, 'error');
  }
}
async function moveTask(id, status) {
  const task = state.data?.tasks?.find(t => t.id === Number(id));
  if (!task || task.status === status || state.movingTask || state.data.project?.status === 'archived') return;
  state.movingTask = true;
  const card = document.querySelector(`[data-task-id="${id}"]`);
  const old = card?.parentElement;
  const sibling = card?.nextSibling;
  const next = document.querySelector(`.kanban-col[data-status="${status}"] .kanban-cards`);
  let animation;
  try {
    if (card && next) {
      const from = card.getBoundingClientRect();
      card.classList.remove('dragging');
      next.append(card);
      const to = card.getBoundingClientRect();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation = card.animate([{
          transform: `translate(${from.left - to.left}px,${from.top - to.top}px) rotate(-2deg)`
        }, {
          transform: 'translate(0,0) rotate(0deg)'
        }], {
          duration: 420,
          easing: 'cubic-bezier(.16,1,.3,1)'
        });
      }
    }
    await Promise.all([api(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: {
        status
      }
    }), animation?.finished.catch(() => {})]);
    toast(`任务已移到${statusLabel(status)}`);
    await loadView();
  } catch (e) {
    animation?.cancel();
    if (old && card) old.insertBefore(card, sibling?.parentElement === old ? sibling : null);
    toast(e.message, 'error');
  } finally {
    state.movingTask = false;
  }
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (target.tagName === 'A') event.preventDefault();
  try {
    if (await extraAction(action, target)) return;
    if (action === 'navigate') {
      event.preventDefault();
      if (target.dataset.view === 'project') return;
      if (target.dataset.view === 'settings') return route('settings');
      if (window.innerWidth < 781) $('#sidebar')?.classList.remove('open');
      return route(target.dataset.view);
    }
    if (action === 'toggle-sidebar') return $('#sidebar')?.classList.toggle('open');
    if (action === 'logout') {
      await api('/api/auth/logout', {
        method: 'POST'
      });
      closeModal();
      history.replaceState(null, '', '#login');
      state.user = null;
      state.csrf = '';
      renderLogin();
      return;
    }
    if (action === 'open-project') return route('project', target.dataset.id);
    if (action === 'create-project') return openCreateProject();
    if (action === 'create-task') return await createTaskDialog(target.dataset.status || 'todo');
    if (action === 'create-user') return openCreateUser();
    if (action === 'create-announcement') return openAnnouncement();
    if (action === 'recovery') {
      event.preventDefault();
      return openRecovery();
    }
    if (action === 'close-modal') {
      if (target.classList.contains('modal-backdrop') && event.target !== target) return;
      event.preventDefault();
      return closeModal();
    }
    if (action === 'toggle-task') {
      event.stopPropagation();
      return toggleTask(target.dataset.id);
    }
    if (action === 'open-notices') return route('announcements');
    if (action === 'user-menu') return route('settings');
    if (action === 'archive-project') {
      try {
        await api(`/api/projects/${state.detailId}/archive`, {
          method: 'POST'
        });
        toast('项目状态已更新');
        await loadView();
      } catch (e) {
        toast(e.message, 'error');
      }
      return;
    }
    if (action === 'project-settings') return openProjectSettings();
    if (action === 'manage-members') return await manageMembers();
    if (action === 'edit-user') return openUserEdit(target.dataset.id);
  } catch (e) {
    toast(e.message, 'error');
  }
});
document.addEventListener('submit', async event => {
  if (!event.target.matches('form')) return;
  event.preventDefault();
  const form = event.target;
  if (form.dataset.busy) return;
  form.dataset.busy = '1';
  const buttons = [...form.querySelectorAll('[type=submit]')];
  buttons.forEach(b => b.disabled = true);
  try {
    await onSubmit(form);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    delete form.dataset.busy;
    buttons.forEach(b => b.disabled = false);
  }
});
document.addEventListener('dragstart', event => {
  const card = event.target.closest('.task-card');
  if (!card) return;
  if (card.getAttribute('draggable') !== 'true') {
    event.preventDefault();
    return;
  }
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.taskId);
});
document.addEventListener('dragend', event => event.target.closest('.task-card')?.classList.remove('dragging'));
document.addEventListener('dragover', event => {
  const col = event.target.closest('.kanban-col');
  if (!col || state.data?.project?.status === 'archived') return;
  event.preventDefault();
  col.classList.add('drag-over');
});
document.addEventListener('dragleave', event => event.target.closest('.kanban-col')?.classList.remove('drag-over'));
document.addEventListener('drop', event => {
  const col = event.target.closest('.kanban-col');
  if (!col) return;
  event.preventDefault();
  col.classList.remove('drag-over');
  const id = event.dataTransfer.getData('text/plain');
  if (/^\d+$/.test(id)) moveTask(id, col.dataset.status);
});
async function boot() {
  setLoading(true);
  try {
    state.config = await api('/api/config');
  } catch (e) {
    app.innerHTML = '<main class="loading"><div class="panel empty-state"><div><strong>暂时无法连接工作台</strong><p>请确认后端已启动，然后重试。</p><button class="button-small primary" data-action="reconnect">重新连接</button></div></div></main>';
    return;
  }
  try {
    const d = await api('/api/auth/me');
    state.user = d.user;
    state.csrf = d.csrfToken;
    const parts = location.hash.slice(1).split('/');
    state.view = ['dashboard', 'projects', 'tasks', 'project', 'announcements', 'admin', 'settings'].includes(parts[0]) ? parts[0] : 'dashboard';
    state.detailId = parts[1] || null;
    await loadView();
  } catch {
    state.loading = false;
    renderLogin();
  }
}
boot();
function showRecoveryCode(code, message = '这是你的账号恢复码，只显示一次。请保存在安全的地方。') {
  openModal(`<div class="modal-head"><div><h2>保存你的恢复码</h2><p>${safe(message)}</p></div></div><div class="modal-body"><code class="recovery-code">${safe(code)}</code><p class="muted">恢复码与密码一样重要。重置密码后会生成新的恢复码。</p><button class="button-small" data-action="copy-code" data-code="${safe(code)}">复制恢复码</button></div><div class="modal-footer"><button class="button-small primary" data-action="close-modal">我已保存</button></div>`);
}
function openRegister() {
  openModal(`<form id="register-form">${modalForm('开启你的工作空间', '注册后可以创建项目，邀请已有成员加入协作。', `<div class="modal-body"><div class="dialog-grid"><label class="form-field"><span>用户名</span><input class="input" name="username" pattern="[A-Za-z][A-Za-z0-9_\\-]{2,31}" minlength="3" maxlength="32" placeholder="字母开头，3–32 位" required></label><label class="form-field"><span>姓名</span><input class="input" name="name" maxlength="80" placeholder="如何称呼你" required></label></div><label class="form-field"><span>邮箱</span><input class="input" name="email" type="email" autocomplete="email" required></label><label class="form-field"><span>密码</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="至少 10 位，包含字母和数字" required></label></div>`, '创建账号')}</form>`);
}
function taskFields(task = {}, projects = [], members = []) {
  return `<label class="form-field"><span>任务标题</span><input class="input" name="title" maxlength="180" value="${safe(task.title || '')}" placeholder="写下下一步要完成什么" required></label>
    <label class="form-field"><span>描述</span><textarea name="description" maxlength="4000" placeholder="补充背景、验收标准或参考资料">${safe(task.description || '')}</textarea></label>
    <div class="dialog-grid">${projects.length ? `<label class="form-field"><span>所属项目</span><select name="project_id" id="task-project-select" required>${projects.map(p => `<option value="${p.id}" ${Number(task.project_id) === p.id ? 'selected' : ''}>${safe(p.name)}</option>`).join('')}</select></label>` : ''}<label class="form-field"><span>负责人</span><select name="assignee_id" id="task-assignee-select"><option value="">暂不分配</option>${members.filter(m => m.status === 'active').map(m => `<option value="${m.id}" ${task.assignee_id === m.id ? 'selected' : ''}>${safe(m.name)}</option>`).join('')}</select></label><label class="form-field"><span>截止日期</span><input class="input" type="date" name="due_date" value="${safe(task.due_date || '')}"></label></div>
    <div class="dialog-grid"><label class="form-field"><span>状态</span><select name="status">${['todo', 'doing', 'done'].map(s => `<option value="${s}" ${(task.status || 'todo') === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}</select></label><label class="form-field"><span>优先级</span><select name="priority">${['low', 'medium', 'high'].map(s => `<option value="${s}" ${(task.priority || 'medium') === s ? 'selected' : ''}>${priorityLabel(s)}</option>`).join('')}</select></label></div>`;
}
async function createTaskDialog(status = 'todo') {
  const {
    projects: all
  } = await api('/api/projects');
  const projects = all.filter(p => p.status === 'active');
  if (!projects.length) {
    openModal(`<div class="modal-head"><div><h2>先创建一个项目</h2><p>任务会保存在项目中，方便组织和协作。</p></div></div><div class="modal-footer"><button class="button-ghost" data-action="close-modal">取消</button><button class="button-small primary" data-action="create-project">创建项目</button></div>`);
    return;
  }
  const projectId = projects.find(p => p.id === Number(state.detailId))?.id || projects[0].id;
  const {
    members
  } = await api(`/api/projects/${projectId}`);
  openModal(`<form id="task-form">${modalForm('新建任务', '一件清晰的小事，是推进的开始。', `<div class="modal-body">${taskFields({
    project_id: projectId,
    status,
    assignee_id: members.some(m => m.id === state.user.id) ? state.user.id : null
  }, projects, members)}</div>`, '创建任务')}</form>`);
}
async function openTaskDetail(taskId) {
  const d = await api(`/api/tasks/${taskId}`);
  const pd = await api(`/api/projects/${d.task.project_id}`);
  state.dialog = d;
  const archived = d.project.status === 'archived';
  openModal(`<div class="modal-head"><div><div class="eyebrow">TASK / ${String(taskId).padStart(3, '0')}</div><h2 style="margin-top:8px">${safe(d.project.name)}</h2><p>查看任务、更新进展，与伙伴留下讨论。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('back')}</button></div><div class="modal-body"><form id="edit-task-form" data-id="${d.task.id}"><fieldset style="border:0;padding:0;margin:0" ${archived ? 'disabled' : ''}>${taskFields(d.task, [], pd.members)}<div class="task-modal-actions">${d.canDelete ? `<button class="button-ghost button-danger" data-action="delete-task" data-id="${d.task.id}">删除任务</button>` : '<span></span>'}<button class="button-small primary" type="submit">保存更改</button></div></fieldset></form><div class="dialog-section"><h3>任务讨论 <span class="muted">${d.comments.length}</span></h3>${d.comments.map(c => `<article class="discussion"><header><b>${safe(c.user_name)}</b><time>${timeAgo(c.created_at)}</time></header><p>${safe(c.body)}</p></article>`).join('') || '<p class="muted">还没有讨论，把想法留在这里。</p>'}${archived ? '<p class="muted">项目已归档，恢复后可以继续讨论。</p>' : `<form id="comment-form" class="comment-form" data-task-id="${d.task.id}" data-project-id="${d.task.project_id}"><label class="sr-only" for="comment-body">评论内容</label><textarea id="comment-body" name="body" maxlength="2000" placeholder="分享进展，或向伙伴提问…" required></textarea><div class="form-actions"><button class="button-small primary" type="submit">${icon('send')} 发送评论</button></div></form>`}</div></div>`);
}
function openProjectSettings() {
  const p = state.data.project;
  openModal(`<form id="edit-project-form" data-id="${p.id}">${modalForm('项目设置', '让目标、时间与描述保持清晰。', `<div class="modal-body"><label class="form-field"><span>项目名称</span><input class="input" name="name" value="${safe(p.name)}" maxlength="120" required></label><label class="form-field"><span>项目描述</span><textarea name="description">${safe(p.description)}</textarea></label><div class="dialog-grid"><label class="form-field"><span>颜色</span><input class="input" name="color" type="color" value="${safe(p.color)}"></label><label class="form-field"><span>截止日期</span><input class="input" name="due_date" type="date" value="${safe(p.due_date || '')}"></label></div><div class="dialog-section"><button class="button-ghost button-danger" data-action="delete-project" data-id="${p.id}">删除项目和全部任务</button></div></div>`)}</form>`);
}
async function manageMembers() {
  const p = await api(`/api/projects/${state.detailId}`),
    {
      users
    } = await api('/api/users');
  const candidates = users.filter(u => !p.members.some(m => m.id === u.id));
  openModal(`<div class="modal-head"><div><h2>项目成员</h2><p>${safe(p.project.name)} · ${p.members.length} 位协作者</p></div><button class="icon-button" aria-label="关闭对话框" data-action="close-modal">${icon('back')}</button></div><div class="modal-body">${p.members.map(m => `<div class="members-row"><span class="avatar ${avatarClass(m.id)}">${initials(m.name)}</span><div class="member-info">${safe(m.name)}<small>${safe(m.email)}${m.status === 'disabled' ? ' · 已停用' : ''}</small></div>${m.id === p.project.owner_id ? '<span class="muted">负责人</span>' : `<button class="button-small button-danger" data-action="remove-member" data-id="${m.id}">移除</button>`}</div>`).join('')}<div class="dialog-section">${candidates.length ? `<form id="member-form"><label class="form-field"><span>添加已有成员</span><select name="user_id">${candidates.map(u => `<option value="${u.id}">${safe(u.name)} · ${safe(u.email)}</option>`).join('')}</select></label><div class="form-actions"><button class="button-small primary" type="submit">加入项目</button></div></form>` : '<p class="muted">所有可用成员都已加入这个项目。</p>'}</div></div>`);
}
function confirmAction(title, detail, fn) {
  state.confirm = fn;
  openModal(`<div class="modal-head"><div><h2>${safe(title)}</h2><p>${safe(detail)}</p></div></div><div class="modal-footer"><button class="button-ghost" data-action="close-modal">取消</button><button class="button-small button-danger" data-action="confirm-action">确认${safe(title.replace('？', ''))}</button></div>`);
}
async function openSearch() {
  state.searchData = null;
  openModal('<div class="modal-head"><div><h2>找到下一步</h2><p>搜索你有权限访问的项目和任务。</p></div><button class="icon-button" aria-label="关闭对话框" data-action="close-modal">' + icon('back') + '</button></div><div class="modal-body"><input class="search-modal" id="search-query" placeholder="输入项目名称、任务标题或关键词" aria-label="搜索关键词"><div class="search-results" id="search-results"><p class="muted">正在读取工作空间…</p></div></div>');
  $('#search-query')?.focus();
  await searchWorkspace('');
}
async function searchWorkspace(query) {
  const requestId = state.searchRequest = (state.searchRequest || 0) + 1;
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    if (requestId !== state.searchRequest || !$('#search-query')) return;
    state.searchData = data;
    renderSearch(query);
  } catch (e) {
    if (requestId === state.searchRequest && $('#search-results')) $('#search-results').innerHTML = `<p class="inline-error">${safe(e.message)}</p>`;
  }
}
function renderSearch(query) {
  if (!state.searchData || !$('#search-results')) return;
  const q = query.toLowerCase().trim();
  const projects = state.searchData.projects.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(q)).slice(0, 8);
  const tasks = state.searchData.tasks.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(q)).slice(0, 20);
  $('#search-results').innerHTML = projects.map(p => `<button class="search-result" data-action="open-project" data-id="${p.id}">${icon('layers')}<span>${safe(p.name)}<small>项目 · ${p.task_count} 项任务${p.status === 'archived' ? ' · 已归档' : ''}</small></span></button>`).join('') + tasks.map(t => `<button class="search-result" data-action="task-detail" data-id="${t.id}">${icon('check')}<span>${safe(t.title)}<small>${safe(t.project_name)} · ${statusLabel(t.status)}</small></span></button>`).join('') || '<div class="empty-state">没有找到相关结果，试试其他关键词。</div>';
}
function editAnnouncement(id) {
  const a = state.data.announcements.find(a => a.id === Number(id));
  if (!a) return;
  openModal(`<form id="edit-announcement-form" data-id="${a.id}">${modalForm('编辑公告', '更新会同步到所有成员的公告栏。', `<div class="modal-body"><label class="form-field"><span>标题</span><input class="input" name="title" value="${safe(a.title)}" required></label><label class="form-field"><span>正文</span><textarea name="body" required>${safe(a.body)}</textarea></label><label class="remember"><input type="checkbox" name="pinned" ${a.pinned ? 'checked' : ''}>置顶公告</label></div>`)}</form>`);
}
function openAdminPassword(id) {
  const u = state.data.users.find(u => u.id === Number(id));
  openModal(`<form id="admin-password-form" data-id="${id}">${modalForm('重置成员密码', `为 ${safe(u.name)} 设置新密码，已登录设备将退出。`, `<div class="modal-body"><label class="form-field"><span>新密码</span><input class="input" name="password" type="password" minlength="10" maxlength="128" required placeholder="至少 10 位，包含字母和数字"></label></div>`, '重置密码')}</form>`);
}
async function extraSubmit(form) {
  const p = formObject(form);
  if (form.id === 'register-form') {
    const d = await api('/api/auth/register', {
      method: 'POST',
      body: p
    });
    state.user = d.user;
    state.csrf = d.csrfToken;
    await route('dashboard');
    showRecoveryCode(d.recoveryCode);
    return true;
  }
  if (form.id === 'edit-task-form') {
    await api(`/api/tasks/${form.dataset.id}`, {
      method: 'PATCH',
      body: p
    });
    toast('任务已保存');
    closeModal();
    await loadView();
    return true;
  }
  if (form.id === 'comment-form') {
    await api(`/api/projects/${form.dataset.projectId}/comments`, {
      method: 'POST',
      body: {
        task_id: Number(form.dataset.taskId),
        body: p.body
      }
    });
    toast('评论已发送');
    await openTaskDetail(form.dataset.taskId);
    return true;
  }
  if (form.id === 'edit-project-form') {
    await api(`/api/projects/${form.dataset.id}`, {
      method: 'PATCH',
      body: p
    });
    toast('项目已更新');
    closeModal();
    await loadView();
    return true;
  }
  if (form.id === 'member-form') {
    await api(`/api/projects/${state.detailId}/members`, {
      method: 'POST',
      body: {
        user_id: Number(p.user_id)
      }
    });
    toast('成员已加入项目');
    await loadView();
    await manageMembers();
    return true;
  }
  if (form.id === 'edit-announcement-form') {
    await api(`/api/announcements/${form.dataset.id}`, {
      method: 'PATCH',
      body: {
        ...p,
        pinned: !!p.pinned
      }
    });
    toast('公告已更新');
    closeModal();
    await loadView();
    return true;
  }
  if (form.id === 'recovery-code-form') {
    const d = await api('/api/auth/recovery-code', {
      method: 'POST',
      body: p
    });
    showRecoveryCode(d.recoveryCode);
    return true;
  }
  if (form.id === 'admin-password-form') {
    await api(`/api/admin/users/${form.dataset.id}/reset-password`, {
      method: 'POST',
      body: p
    });
    toast('密码已重置');
    closeModal();
    if (Number(form.dataset.id) === state.user.id) {
      state.user = null;
      state.csrf = '';
      renderLogin();
    } else await loadView();
    return true;
  }
  return false;
}
async function extraAction(action, target) {
  if (action === 'register') {
    openRegister();
    return true;
  }
  if (action === 'demo-login') {
    $('#login-form [name=account]').value = 'admin';
    $('#login-form [name=password]').value = 'Zheguang@2026';
    return true;
  }
  if (action === 'task-detail') {
    await openTaskDetail(target.dataset.id);
    return true;
  }
  if (action === 'retry') {
    await loadView();
    return true;
  }
  if (action === 'reconnect') {
    await boot();
    return true;
  }
  if (action === 'filter') {
    state.filter = target.dataset.filter;
    state.view === 'tasks' ? renderTasks(state.data) : renderProjects(state.data);
    return true;
  }
  if (action === 'confirm-action') {
    const fn = state.confirm;
    state.confirm = null;
    if (!fn) return true;
    closeModal();
    await fn();
    return true;
  }
  if (action === 'copy-code') {
    try {
      await navigator.clipboard.writeText(target.dataset.code);
      toast('恢复码已复制');
    } catch {
      toast('请选中恢复码并复制', 'error');
    }
    return true;
  }
  if (action === 'delete-task') {
    const taskId = target.dataset.id;
    confirmAction('删除任务', '任务及讨论将永久删除。', async () => {
      await api(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      });
      toast('任务已删除');
      await loadView();
    });
    return true;
  }
  if (action === 'delete-project') {
    const projectId = target.dataset.id;
    confirmAction('删除项目', '项目内的全部任务和讨论也会删除，此操作无法撤销。', async () => {
      await api(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      toast('项目已删除');
      await route('projects');
    });
    return true;
  }
  if (action === 'remove-member') {
    const memberId = target.dataset.id;
    confirmAction('移除成员', '该成员将失去项目访问权限，其任务会改为未分配。', async () => {
      await api(`/api/projects/${state.detailId}/members?user_id=${memberId}`, {
        method: 'DELETE'
      });
      toast('成员已移除');
      await loadView();
      await manageMembers();
    });
    return true;
  }
  if (action === 'search') {
    await openSearch();
    return true;
  }
  if (action === 'edit-announcement') {
    editAnnouncement(target.dataset.id);
    return true;
  }
  if (action === 'delete-announcement') {
    const aid = target.dataset.id;
    confirmAction('删除公告', '这条公告将从所有成员的公告栏移除。', async () => {
      await api(`/api/announcements/${aid}`, {
        method: 'DELETE'
      });
      toast('公告已删除');
      await loadView();
    });
    return true;
  }
  if (action === 'admin-password') {
    openAdminPassword(target.dataset.id);
    return true;
  }
  if (action === 'recovery-code') {
    openModal(`<form id="recovery-code-form">${modalForm('生成账号恢复码', '需要验证当前密码。新的恢复码会使旧恢复码立即失效。', `<div class="modal-body"><label class="form-field"><span>当前密码</span><input class="input" type="password" name="password" required></label></div>`, '生成恢复码')}</form>`);
    return true;
  }
  return false;
}
document.addEventListener('input', e => {
  if (e.target.id === 'search-query') {
    clearTimeout(state.searchTimer);
    const query = e.target.value;
    state.searchRequest = (state.searchRequest || 0) + 1;
    state.searchTimer = setTimeout(() => searchWorkspace(query), 150);
  }
  if (e.target.classList.contains('input')) e.target.classList.remove('invalid');
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'task-project-select') return;
  const form = e.target.closest('form'),
    projectId = e.target.value,
    select = form.querySelector('[name=assignee_id]');
  select.disabled = true;
  try {
    const {
      members
    } = await api(`/api/projects/${projectId}`);
    if (e.target.value !== projectId) return;
    select.innerHTML = '<option value="">暂不分配</option>' + members.filter(m => m.status === 'active').map(m => `<option value="${m.id}" ${m.id === state.user.id ? 'selected' : ''}>${safe(m.name)}</option>`).join('');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    select.disabled = false;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    $('#sidebar')?.classList.remove('open');
  }
  if (e.key === 'Enter' && e.target.matches('[role=button]')) {
    e.preventDefault();
    e.target.click();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k' && state.user) {
    e.preventDefault();
    openSearch().catch(err => toast(err.message, 'error'));
  }
  if (e.key === 'Tab' && $('.modal')) {
    const f = [...$('.modal').querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) {
      e.preventDefault();
      f.at(-1).focus();
    } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
      e.preventDefault();
      f[0].focus();
    }
  }
});
window.addEventListener('hashchange', () => {
  if (!state.user) return;
  const [view, detail] = location.hash.slice(1).split('/');
  if (['dashboard', 'projects', 'tasks', 'project', 'announcements', 'admin', 'settings'].includes(view)) route(view, detail);
});
