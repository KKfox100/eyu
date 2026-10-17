# e语 · 英语打卡自学 H5

> 高频词 + 实用语块（Chunks）+ 语法骨架，用 SM-2 间隔重复算法安排每天该学什么。
> 全栈跑在 Cloudflare 免费额度上：Pages + Workers + D1 + KV。

## 🔗 线上地址

| 服务 | 地址 |
| --- | --- |
| 应用（前端 + `/api` 同源代理） | **https://eyu.pages.dev** |
| API 源站（Worker） | https://eyu-api.2412.workers.dev |

> **为什么要加一层 Pages Functions 代理**：国内网络对 `*.workers.dev` 普遍存在 DNS 污染
> （实测解析到 `103.252.115.53` 后连接超时），而 `*.pages.dev` 可以直连。
> `frontend/functions/api/[[path]].ts` 把 `/api/*` 从 Pages 边缘转发到 Worker，
> 浏览器只访问 `eyu.pages.dev` 一个域 —— 顺带把 CORS 也省了。
> 若你的网络能直连 workers.dev，也可以把 `VITE_API_BASE` 指向 Worker 域名，走原生跨域。

---

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **Phase 1** | 基础设施：Vite + Vue 3 + Tailwind + PWA、Worker 路由、D1 Schema、JWT 鉴权、SM-2 引擎、今日队列、基础学习闭环、统计热力图 | ✅ 已完成并上线 |
| Phase 2 | 卡片滑动/翻转强化、完形填空、语序重组、Web Speech 口语测评 | ⏳ 待开始 |
| Phase 3 | AI 智能剪藏解析、Cron 打卡提醒、数据导出 | ⏳ 待开始 |

---

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | Vue 3（`<script setup>`）+ Vite 6 + Tailwind CSS 4 | 移动端优先，暗色模式跟随系统并可手动切换 |
| PWA | vite-plugin-pwa（Workbox） | 可添加到主屏，静态资源离线缓存；`/api/*` 强制走网络，不缓存复习队列 |
| API | Cloudflare Workers + Hono | 轻量路由，冷启动快 |
| 主库 | Cloudflare D1（SQLite） | 用户、词库、记忆状态、复习日志 |
| 会话 | Cloudflare KV | JWT 会话白名单，登出/强制下线即时生效 |
| 鉴权 | 自实现 HS256 JWT（WebCrypto）+ PBKDF2-SHA256 | 不依赖 Node 专用库，Workers 原生可跑 |
| 语音 | Web Speech API | `speechSynthesis` 朗读已接入，`SpeechRecognition` 留给 Phase 2 |

---

## 目录结构

```
e语/
├─ frontend/                 # Cloudflare Pages 项目
│  ├─ src/
│  │  ├─ views/              # Login / Today / Study / Stats / Library / Me
│  │  ├─ components/         # StudyCard（3D 翻转）、Heatmap、BottomNav
│  │  ├─ lib/api.ts          # 带类型的 API 客户端
│  │  └─ stores/auth.ts      # 登录态
│  ├─ functions/api/[[path]].ts  # Pages Functions：/api/* 同源代理到 Worker
│  ├─ public/                # favicon + PWA 图标 + _routes.json
│  └─ vite.config.ts         # PWA / 代理 / 构建
├─ worker/                   # Cloudflare Workers 项目
│  ├─ src/
│  │  ├─ index.ts            # 路由挂载 + CORS + 错误处理
│  │  ├─ lib/sm2.ts          # ★ SM-2 核心算法（纯函数，可单测）
│  │  ├─ lib/jwt.ts          # HS256 签发/校验
│  │  ├─ lib/password.ts     # PBKDF2 哈希
│  │  ├─ middleware/auth.ts  # Bearer 鉴权 + KV 会话校验
│  │  └─ routes/             # auth / study / stats
│  ├─ schema.sql             # ★ D1 表结构
│  ├─ seed.sql               # 65 张种子卡片（40 词 + 15 语块 + 10 句型）
│  ├─ wrangler.toml          # ★ Worker / D1 / KV 配置
│  └─ test/sm2.test.ts       # 12 个算法用例
└─ scripts/
   ├─ setup-cloudflare.mjs   # 一键建库 + 回填 ID + 灌数据 + 写机密
   └─ smoke-test.mjs         # 线上冒烟测试（注册→队列→评级→统计→登出）
```

---

## 本地开发

```bash
npm install

# 1. 初始化本地 D1（模拟库，不影响线上）
cd worker
cp .dev.vars.example .dev.vars        # Windows: copy .dev.vars.example .dev.vars
npx wrangler d1 execute eyu-db --local --file=./schema.sql
npx wrangler d1 execute eyu-db --local --file=./seed.sql
npx wrangler dev                       # API → http://127.0.0.1:8787

# 2. 另开一个终端跑前端（/api 已代理到 8787）
cd frontend && npm run dev             # → http://127.0.0.1:5173
```

跑算法单测：

```bash
cd worker && npm test                  # node --experimental-strip-types --test
```

---

## 线上验证

```bash
node scripts/smoke-test.mjs                              # 打 https://eyu.pages.dev
BASE=http://127.0.0.1:8787 node scripts/smoke-test.mjs   # 打本地 Worker
```

覆盖 11 项：注册、队列按频次发词、四种评级的调度结果、统计聚合、当前用户、
非法评级被拒、未鉴权被拒、登出后令牌立即失效。

---

## 部署到 Cloudflare

> 当前环境已经部署完成（D1 `a5de6486-…`、KV `0cd26cd6…`、Worker `eyu-api`、Pages `eyu`）。
> 下面是**从零重建**或迁移到新账号时的完整步骤。

### 0. 前置

```bash
npx wrangler login                     # 或 export CLOUDFLARE_API_TOKEN=...
```

> 如果所在网络访问不到 `dash.cloudflare.com`（OAuth 回调走这个域名），
> 请改用 **API Token**：Cloudflare 控制台 → My Profile → API Tokens → Create Token，
> 权限勾选 `Workers Scripts:Edit`、`Workers KV Storage:Edit`、`D1:Edit`、`Cloudflare Pages:Edit`。

### 1. 初始化资源（D1 + KV + 表 + 种子 + 机密）

```bash
node scripts/setup-cloudflare.mjs
```

脚本会自动：创建 `eyu-db` → 回填 `database_id` → 创建 `SESSIONS` KV → 回填 id →
远程执行 `schema.sql` / `seed.sql` → 写入随机 `JWT_SECRET`。

### 2. 部署 API

```bash
npm run deploy:api
# 记下输出里的 https://eyu-api.<你的子域>.workers.dev
```

### 3. 部署前端

```bash
cd frontend
npm run build                          # 同源模式：API 走 /api（由 Pages Functions 代理）
npx wrangler pages project create eyu --production-branch=main
npx wrangler pages deploy dist --project-name=eyu --branch=main
```

> 如果你能直连 `*.workers.dev`，也可以改成跨域模式：
> `VITE_API_BASE=https://eyu-api.<子域>.workers.dev npm run build`，并删掉 `frontend/functions/`。

### 4. 放行跨域

拿到 Pages 域名后，把它加进 `worker/wrangler.toml` 的 `CORS_ORIGINS`，重新 `npm run deploy:api`：

```toml
CORS_ORIGINS = "https://eyu.pages.dev,https://你的自定义域名"
```

---

## API 一览

所有业务接口返回 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（含 D1 连通性） |
| POST | `/api/auth/register` | 注册，返回 JWT |
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/auth/logout` | 注销（删除 KV 会话） |
| GET | `/api/auth/me` | 当前用户 |
| PATCH | `/api/auth/me` | 修改每日上限 / 时区 / 昵称 |
| GET | `/api/study/queue?limit=20` | 今日队列：**到期复习优先，再按频次发新词** |
| POST | `/api/study/review` | 提交评级 `{ userCardId, rating, mode, elapsedMs }` |
| GET | `/api/study/cards` | 词库浏览（分页 / 类型 / 关键词） |
| GET | `/api/stats/overview?days=90` | 今日进度、连续天数、总量、热力图 |
| GET | `/api/stats/history?limit=30` | 每日复习明细 |

除 `register` / `login` / `health` 外均需 `Authorization: Bearer <token>`。

---

## SM-2 是怎么算的

四档反馈映射到不同的调度策略（`worker/src/lib/sm2.ts`）：

| 评级 | 语义 | stage | EF | 间隔 |
| --- | --- | --- | --- | --- |
| `0` 忘记 | 重置 | → 0 | −0.20 | 10 分钟后重刷，`lapses + 1` |
| `1` 模糊 | 原地 | 不变 | −0.15 | 当前间隔 × 0.6（至少 1 天） |
| `2` 掌握 | 前进一级 | +1 | 不变 | `BASE[stage] × EF / 2.5` |
| `3` 熟知 | 跳一级 | +2 | +0.15 | `BASE[stage] × EF / 2.5` |

- 基础间隔表：`[0, 1, 3, 7, 14, 30, 60, 120, 240]` 天 —— 「掌握」连打五次正好是 1 → 3 → 7 → 14 → 30。
- EF 被夹在 **1.3 ~ 2.8**，单次间隔封顶 365 天，避免长期打「熟知」把间隔撑成天文数字。
- 算法是**纯函数**（时间由参数传入），因此可以单测、可以回放历史数据。

**新词优先级**：`cards_master.frequency_rank` 升序，未学过的优先，且受 `daily_new_limit` 限制；
**复习永远排在新词前面**（`GET /queue` 先取到期卡片，剩余名额才发新词）。

---

## 数据库

4 张表 + 1 个视图，详见 `worker/schema.sql`：

- `users` — 账号、时区、每日新词/复习上限
- `cards_master` — 词/语块/句型主表；`frequency_rank` 决定新词顺序；`owner_id` 为 NULL 是公共词库，非 NULL 是用户私有卡片（Phase 3 剪藏产物）
- `user_cards` — 每用户每卡一行，SM-2 状态（stage / EF / interval / next_review_at / lapses）
- `review_logs` — 每次作答一行，带 `review_date`（用户本地日期），是热力图与正确率的唯一数据源
- `v_due_cards` — `user_cards JOIN cards_master`，Worker 直接查它拿「到期卡片 + 内容」

> 在原需求 Schema 基础上增加了：`frequency_rank`、`tags`、`owner_id`、`first_seen_date`、`review_logs` 表、
> 以及 `user_cards(user_id, card_id)` 唯一索引 —— 前几项是「按频次发词」「私有卡片」「每日限额」「打卡统计」的必要条件。

---

## 注意事项

- **免费额度**：Workers 10 万请求/天、D1 5GB、KV 10 万读/天，个人或小圈子够用。
- **PBKDF2 与 CPU 上限**：免费计划单请求 10ms CPU，10 万次迭代的 PBKDF2 可能逼近上限。
  若注册/登录偶发 `1102` 错误，把 `PBKDF2_ITERATIONS` 调到 `50000`（已写入哈希串，调低不影响老用户登录）。
- **JWT_SECRET 必须换**：`wrangler secret put JWT_SECRET`，不要用仓库里的开发值。
- **令牌有效期 7 天**：过期后自动跳登录页；登出会删除 KV 会话，令牌立即失效。
- **`GET /queue` 有副作用**：会把新词写入 `user_cards`（每天首次进入学习页时发放），不要在前端轮询它。

---

## Phase 2 / 3 预留

- 前端 `StudyView` 的 `mode` 字段已支持 `recall | cloze | order | speak`，Phase 2 直接扩展测验组件即可，服务端无需改表。
- `worker/src/index.ts` 已导出 `scheduled()` 处理器，Phase 3 打开 `wrangler.toml` 里的 `[triggers]` 即可接 Cron。
- `cards_master.source` / `owner_id` 已为 AI 剪藏产物留好位置。
