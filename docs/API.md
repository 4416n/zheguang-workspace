# API 概览

前后端同源。需要请求体的写接口使用 `Content-Type: application/json`。登录和注册返回 `{ user, csrfToken }`，Cookie 由服务器设置。登录后的 POST、PATCH、DELETE 请求需附带 `X-CSRF-Token`。无请求体的退出、归档接口允许空 POST。

失败统一返回 `{ "error": { "code": "…", "message": "…" } }`。主要状态码：400 输入错误、401 未登录、403 无权限、404 不存在、409 冲突、413 内容过大、429 请求频繁。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 数据库连接检查 |
| GET | `/api/config` | 公开站点配置及注册开关 |
| POST | `/api/auth/register` | `username, name, email, password`，返回一次性恢复码 |
| POST | `/api/auth/login` | `account, password, remember` |
| GET | `/api/auth/me` | 当前用户和 CSRF token |
| POST | `/api/auth/logout` | 注销当前会话 |
| POST | `/api/auth/change-password` | `currentPassword, newPassword`，注销其他设备 |
| POST | `/api/auth/recovery-code` | `password`，生成替代旧码的新恢复码 |
| POST | `/api/auth/recovery/reset` | `email, code, newPassword`，轮换恢复码并注销原会话 |
| PATCH | `/api/profile` | `name, bio`，仅修改本人资料 |
| GET | `/api/dashboard` | 当前权限范围内的统计和动态 |
| GET | `/api/search?q=关键词` | 权限内搜索，最多 8 个项目、20 个任务 |
| GET | `/api/projects` | 可访问的全部项目 |
| POST | `/api/projects` | `name, description, color, due_date` |
| GET | `/api/projects/:id` | 项目、成员、任务、动态 |
| PATCH | `/api/projects/:id` | 部分更新项目属性；负责人或管理员 |
| DELETE | `/api/projects/:id` | 删除项目、任务和讨论，保留审计记录 |
| POST | `/api/projects/:id/archive` | 在归档／活跃之间切换 |
| POST | `/api/projects/:id/members` | `user_id`，加入已有成员 |
| DELETE | `/api/projects/:id/members?user_id=…` | 移除成员，不能移除负责人 |
| GET | `/api/tasks` | 分配给当前用户且仍有访问权的任务 |
| POST | `/api/projects/:id/tasks` | 创建任务 |
| GET | `/api/tasks/:id` | 任务详情和评论 |
| PATCH | `/api/tasks/:id` | 部分更新任务，未传字段保留 |
| DELETE | `/api/tasks/:id` | 创建者、项目负责人或管理员可删除 |
| POST | `/api/projects/:id/comments` | `task_id, body`，添加讨论 |
| GET | `/api/users` | 可加入项目的活跃成员目录 |
| GET | `/api/announcements` | 公告列表 |
| POST | `/api/announcements` | `title, body, pinned`，管理员发布 |
| PATCH / DELETE | `/api/announcements/:id` | 管理员编辑／删除 |
| GET | `/api/admin/overview` | 用户、项目、公告、设置和最近 100 条记录 |
| POST | `/api/admin/users` | `username, name, email, password, role` |
| PATCH | `/api/admin/users/:id` | `name, bio, role, status` |
| POST | `/api/admin/users/:id/reset-password` | `password`，注销目标用户原有会话 |
| PATCH | `/api/admin/settings` | `site_name, site_description, registration_enabled` |

任务字段为 `title, description, status, priority, assignee_id, due_date`。状态取 `todo / doing / done`，优先级取 `low / medium / high`，未分配用 `null` 或空字符串。日期格式 `YYYY-MM-DD`。负责人必须是项目中仍可用的成员。

用户角色为 `admin / member`，账号状态为 `active / disabled`；项目状态为 `active / archived`。不可停用当前管理员或降级自己。账号停用或角色改变会注销其已有会话。
