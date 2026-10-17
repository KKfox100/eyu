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
| **Phase 2a** | 完形填空 + 语序重组（复习卡自动出题、判分即评级） | ✅ 已完成并上线 |
| Phase 2b | Web Speech 口语测评（朗读匹配） | ⏳ 待开始 |
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
│  │  ├─ components/         # StudyCard（3D 翻转）、ExerciseCard（填空 / 语序）、Heatmap、BottomNav
│  │  ├─ lib/api.ts          # 带类型的 API 客户端
│  │  ├─ lib/prefs.ts        # 本地偏好（复习是否用练习题）
│  │  └─ stores/auth.ts      # 登录态
│  ├─ functions/api/[[path]].ts  # Pages Functions：/api/* 同源代理到 Worker
│  ├─ public/                # favicon + PWA 图标 + _routes.json
│  └─ vite.config.ts         # PWA / 代理 / 构建
├─ worker/                   # Cloudflare Workers 项目
│  ├─ src/
│  │  ├─ index.ts            # 路由挂载 + CORS + 错误处理
│  │  ├─ lib/sm2.ts          # ★ SM-2 核心算法（纯函数，可单测）
│  │  ├─ lib/exercise.ts     # ★ 练习题生成（挖空 / 打乱 / 干扰项，纯函数）
│  │  ├─ lib/jwt.ts          # HS256 签发/校验
│  │  ├─ lib/password.ts     # PBKDF2 哈希
│  │  ├─ middleware/auth.ts  # Bearer 鉴权 + KV 会话校验
│  │  └─ routes/             # auth / study / stats
│  ├─ schema.sql             # ★ D1 表结构
│  ├─ seed.sql               # 65 张种子卡片（40 词 + 15 语块 + 10 句型）
│  ├─ seeds/                 # 扩充词库：words-2 / words-3 / chunks-2 / grammar-2（共 340 张）
│  ├─ migrations/            # 增量迁移（如存量用户每日额度 10 → 20）
│  ├─ wrangler.toml          # ★ Worker / D1 / KV 配置
│  └─ test/                  # sm2 + exercise 共 25 个用例
└─ scripts/
   ├─ setup-cloudflare.mjs   # 一键建库 + 回填 ID + 灌数据 + 写机密
   ├─ apply-sql.mjs          # 按顺序幂等应用全部 SQL（本地 / --remote）
   ├─ check-exercise.mjs     # 抽样打印生成的练习题，人工看挖空/切词对不对
   └─ smoke-test.mjs         # 线上冒烟测试（注册→队列→评级→统计→加练→登出）
```

---

## 本地开发

```bash
npm install

# 1. 初始化本地 D1（模拟库，不影响线上）
cp worker/.dev.vars.example worker/.dev.vars   # Windows: copy worker\.dev.vars.example worker\.dev.vars
node scripts/apply-sql.mjs --local             # 依次应用 schema / seed / seeds / migrations（幂等）
node scripts/apply-sql.mjs --remote            # 同步到线上 D1（需 Token）
cd worker && npx wrangler dev                  # API → http://127.0.0.1:8787

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

覆盖 13 项：注册、队列按频次发词、单轮容量、四种评级的调度结果、统计聚合、当前用户、
非法评级被拒、加练可突破每日额度、未鉴权被拒、登出后令牌立即失效。

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
| GET | `/api/study/queue?limit=30&extra=0` | 今日队列：**到期复习优先，再按频次发新词**；`extra=1` 为加练 |
| GET | `/api/study/exercise?userCardId=…&mode=auto` | 生成练习题（`auto` / `cloze` / `order`）；出不了题返回 `available:false` |
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

### 学习强度

| 旋钮 | 默认 | 说明 |
| --- | --- | --- |
| 词库总量 | **340 张**（280 词 / 35 语块 / 25 句型） | 按频次排序发放，够学 3 个月以上 |
| 每日新词 | **20 张**（可在「我的」里调到 0–100） | 存量用户由 `migrations/001` 从 10 提到 20 |
| 单轮会话 | **30 张** | 复习多时新词会被挤压，这是刻意的 |
| 每日复习上限 | **100 张** | 到期卡片太多时的保护阈值 |
| 加练 | `?extra=1` | 突破当日新词额度，上限 `max(每日新词 × 3, 60)`；完成页有「继续加练」入口 |

> 一轮学完不想到此为止？点「继续加练」会再发 30 张（今日新词总额度最多到 60），
> 学过的卡片第二天按 SM-2 曲线回到复习队列。

---

## 练习题是怎么生成的

复习卡（`reps > 0`）进入学习页时，前端问一句 `GET /api/study/exercise?mode=auto`，
后端从**例句里现做一道题**，不需要额外的人工题库。新卡不走这条路 —— 第一次见还是先看翻转卡。

| 题型 | 适用 | 怎么出 |
| --- | --- | --- |
| **完形填空** `cloze` | 单词、语块 | 在例句里定位目标词/语块挖成 `____`，给 4 个选项 |
| **语序重组** `order` | 全部类型 | 例句切词打乱，点词块排回原序 |

几个刻意的取舍：

- **语法卡不做完形**。它的 `content` 是 `It takes sb. + 时间 + to do sth.` 这种骨架，在例句里根本不是字面串，挖空只会挖出个空。
- **词形变化靠词形表，不靠前缀猜**。`get → getting`、`study → studied`、`run → running` 都能认出来；猜前缀既会漏（长度差 4）又会误伤（`get → getter`）。
- **空格揭晓时填原句的真实形态**。例句是「It **takes** 20 minutes」，选项给原形 `take`，填回空格的是 `takes`，并附一行「原句里写作 takes」—— 否则句子会变成病句。
- **干扰项按词性过滤**。词库里 280 个词都带 `v. / adj. / n.` 前缀，选项只在同词性里挑，再按长度接近排序。不这么做的话，「Can I ____ your charger?」的选项里会冒出个 `idea`，答案等于白送。
- **出不了题就退回翻转卡**。匹配不上、句子太短（语序重组要求 ≥ 5 个词块）或太长（> 14）一律返回 `available:false`，宁可不练也不出废题。

**判分即评级**：答对记「掌握」(2)，答错记「模糊」(1)。不用 `0`（忘记）是因为一次手滑就重置阶段太重。
「我的 → 复习用练习题」可以整体关掉，退回纯翻转卡。

抽样检查生成质量：

```bash
node scripts/check-exercise.mjs          # 注册新号 → 学 30 张 → 逐张打印题目
SAMPLE=20 node scripts/check-exercise.mjs
```

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

## 下一步预留

- `review_logs.mode` 已能记 `recall | cloze | order | speak`；口语测评（`speak`）只需再加一个题型组件，服务端无需改表。
- `worker/src/index.ts` 已导出 `scheduled()` 处理器，Phase 3 打开 `wrangler.toml` 里的 `[triggers]` 即可接 Cron。
- `cards_master.source` / `owner_id` 已为 AI 剪藏产物留好位置。
