# e语 · 英语打卡自学 H5

> 高频词 + 实用语块（Chunks）+ 语法骨架，用 SM-2 间隔重复算法安排每天该学什么。
> 全栈跑在 Cloudflare 免费额度上：Pages + Workers + D1 + KV。

## 🔗 线上地址

| 服务 | 地址 |
| --- | --- |
| 应用（自定义域，推荐） | **https://eyu.letsgo.cc.cd** |
| 应用（Cloudflare 默认域） | https://eyu.pages.dev |
| API 源站（Worker） | https://eyu-api.2412.workers.dev |

> 两个域名指向同一个 Pages 项目，`/api/*` 都走同源代理，用哪个都行。
> 自定义域更短、好记，适合分享；`*.pages.dev` 留作备用（万一自定义域 DNS 出问题）。

> **为什么要加一层 Pages Functions 代理**：国内网络对 `*.workers.dev` 普遍存在 DNS 污染
> （实测解析到 `103.252.115.53` 后连接超时），而 `*.pages.dev` 和自定义域可以直连。
> `frontend/functions/api/[[path]].ts` 把 `/api/*` 从 Pages 边缘转发到 Worker，
> 浏览器只访问一个域 —— 顺带把 CORS 也省了。
> 若你的网络能直连 workers.dev，也可以把 `VITE_API_BASE` 指向 Worker 域名，走原生跨域。

---

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **Phase 1** | 基础设施：Vite + Vue 3 + Tailwind + PWA、Worker 路由、D1 Schema、JWT 鉴权、SM-2 引擎、今日队列、基础学习闭环、统计热力图 | ✅ 已完成并上线 |
| **Phase 2a** | 完形填空 + 语序重组（复习卡自动出题、判分即评级） | ✅ 已完成并上线 |
| **Phase 2b** | Web Speech 口语测评（朗读打分、逐词标红） | ✅ 已完成并上线 |
| **Phase 3a** | AI 智能剪藏（粘贴英文 → 拆成卡片 → 勾选导入词库） | ✅ 已完成并上线 |
| **Phase 3b** | Cron 打卡提醒（每天 19:30 推群机器人，今天学过就不打扰） | ✅ 已完成并上线 |
| Phase 3c | 数据导出（CSV / JSON） | ⏳ 待开始 |

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
| 语音 | Web Speech API | `speechSynthesis` 朗读 + `SpeechRecognition` 跟读测评（本地识别，不传音频上云） |
| AI | Workers AI | 剪藏走 4 个模型回退链（llama-3.3-70b → llama-4-scout → qwen3 → mistral-small） |
| 定时 | Cron Triggers | 每天 UTC 11:30（北京 19:30）跑一次提醒 |

---

## 目录结构

```
e语/
├─ frontend/                 # Cloudflare Pages 项目
│  ├─ src/
│  │  ├─ views/              # Login / Today / Study / Stats / Library / Clip / Me
│  │  ├─ components/         # StudyCard（3D 翻转）、ExerciseCard（填空 / 语序）、SpeakCard（跟读）、Heatmap、BottomNav
│  │  ├─ lib/api.ts          # 带类型的 API 客户端
│  │  ├─ lib/speech.ts       # ★ 口语评分（LCS 对齐，纯函数）
│  │  ├─ lib/prefs.ts        # 本地偏好（复习是否用练习题）
│  │  └─ stores/auth.ts      # 登录态
│  ├─ functions/api/[[path]].ts  # Pages Functions：/api/* 同源代理到 Worker
│  ├─ public/                # favicon + PWA 图标 + _routes.json
│  └─ vite.config.ts         # PWA / 代理 / 构建
├─ worker/                   # Cloudflare Workers 项目
│  ├─ src/
│  │  ├─ index.ts            # 路由挂载 + CORS + 错误处理 + scheduled() 提醒任务
│  │  ├─ lib/sm2.ts          # ★ SM-2 核心算法（纯函数，可单测）
│  │  ├─ lib/exercise.ts     # ★ 练习题生成（挖空 / 打乱 / 干扰项，纯函数）
│  │  ├─ lib/clip.ts         # ★ 模型输出 → 卡片（取正文 / 抠 JSON / 截断修复，纯函数）
│  │  ├─ lib/webhook.ts      # ★ 群机器人白名单与报文格式（纯函数）
│  │  ├─ lib/jwt.ts          # HS256 签发/校验
│  │  ├─ lib/password.ts     # PBKDF2 哈希
│  │  ├─ middleware/auth.ts  # Bearer 鉴权 + KV 会话校验
│  │  └─ routes/             # auth / study / stats / clip
│  ├─ schema.sql             # ★ D1 表结构
│  ├─ seed.sql               # 65 张种子卡片（40 词 + 15 语块 + 10 句型）
│  ├─ seeds/                 # 扩充词库：words-2 / words-3 / chunks-2 / grammar-2（共 340 张）
│  ├─ migrations/            # 增量迁移（每日额度 10 → 20、提醒字段）
│  ├─ wrangler.toml          # ★ Worker / D1 / KV / AI / Cron 配置
│  └─ test/                  # sm2 + exercise + clip 共 39 个用例
└─ scripts/
   ├─ setup-cloudflare.mjs   # 一键建库 + 回填 ID + 灌数据 + 写机密
   ├─ apply-sql.mjs          # 按顺序幂等应用全部 SQL（本地 / --remote）
   ├─ check-exercise.mjs     # 抽样打印生成的练习题，人工看挖空/切词对不对
   ├─ smoke-test.mjs         # 线上接口冒烟（注册→队列→评级→统计→加练→登出）
   ├─ cdp-clip.mjs           # 真实浏览器跑剪藏全流程并截图
   └─ cdp-me.mjs             # 真实浏览器验证提醒设置（含非法域名被拒）
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
node scripts/smoke-test.mjs                              # 打 https://eyu.letsgo.cc.cd
BASE=https://eyu.pages.dev node scripts/smoke-test.mjs    # 换域名打
BASE=http://127.0.0.1:8787 node scripts/smoke-test.mjs    # 打本地 Worker

node scripts/cdp-clip.mjs     # 真实浏览器：示例文本 → 解析 → 导入，截图存 shots/
node scripts/cdp-me.mjs       # 真实浏览器：提醒开关 → 非法域名被拒 → 保存落库
```

`smoke-test.mjs` 覆盖 13 项：注册、队列按频次发词、单轮容量、四种评级的调度结果、统计聚合、
当前用户、非法评级被拒、加练可突破每日额度、未鉴权被拒、登出后令牌立即失效。

> 两个 `cdp-*` 脚本走 headless Chrome + CDP，会真跑一遍 AI 剪藏（8-30 秒）。
> 它们每次用全新的 `user-data-dir` 并禁用缓存 —— 否则 PWA 的 Service Worker
> 会把上一次的构建喂给你，测的是旧版本。

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

### 4. 绑自定义域（可选）

在 Cloudflare 控制台 **Workers & Pages → eyu → Custom domains → Set up a custom domain**，
填 `eyu.你的域名`，按提示加一条 CNAME 指向 `eyu.pages.dev`。证书由 Cloudflare 自动签发，
一般几分钟生效。

绑好之后要同步三处，否则提醒消息里的链接还是旧域名：

| 位置 | 改什么 |
| --- | --- |
| `worker/wrangler.toml` | `SITE_URL`（提醒文案里的链接） |
| `worker/wrangler.toml` | `CORS_ORIGINS`（加新域，旧域留着） |
| 各验证脚本 | 默认 `BASE`（或跑的时候用 `BASE=...` 覆盖） |

```toml
SITE_URL     = "https://eyu.letsgo.cc.cd"
CORS_ORIGINS = "https://eyu.letsgo.cc.cd,https://eyu.pages.dev,http://localhost:5173"
```

改完 `npm run deploy:api`。前端不用重新构建 —— 页面里没有写死域名，
`/api/*` 走的是相对路径，换域自然跟着走。

> PWA 换域后要**重新安装**：Service Worker 是按 origin 隔离的，
> 旧域的桌面图标还是旧域的缓存。

### 5. 放行跨域

只有「前端直连 Worker」的模式才需要。同源代理模式（默认）下 CORS 不参与，
但 `CORS_ORIGINS` 还是建议填全，方便临时用 `curl` 或别的前端调接口。

```toml
CORS_ORIGINS = "https://eyu.letsgo.cc.cd,https://eyu.pages.dev"
```

> 不在白名单的来源**不会报错**，只是响应里没有 `Access-Control-Allow-Origin` ——
> 浏览器侧表现为跨域被拦，服务端日志里看不出异常。

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
| PATCH | `/api/auth/me` | 修改每日上限 / 时区 / 昵称 / 提醒开关与 webhook |
| GET | `/api/study/queue?limit=30&extra=0` | 今日队列：**到期复习优先，再按频次发新词**；`extra=1` 为加练 |
| GET | `/api/study/exercise?userCardId=…&mode=auto` | 生成练习题（`auto` / `cloze` / `order`）；出不了题返回 `available:false` |
| POST | `/api/study/review` | 提交评级 `{ userCardId, rating, mode, elapsedMs }` |
| GET | `/api/study/cards` | 词库浏览（分页 / 类型 / 关键词） |
| GET | `/api/stats/overview?days=90` | 今日进度、连续天数、总量、热力图 |
| GET | `/api/stats/history?limit=30` | 每日复习明细 |
| POST | `/api/clip/analyze` | 剪藏解析：`{ text }` → `{ cards, model, chars }`（不落库） |
| POST | `/api/clip/import` | 剪藏导入：`{ cards }` → `{ imported, skipped }`（按 content 去重） |

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

## 口语测评怎么打分

点学习页右上角的麦克风，读完一句，前端拿 `SpeechRecognition` 的识别结果和目标句对齐打分
（`frontend/src/lib/speech.ts`，纯函数，11 个单测）。

**不做逐字相等比较**。识别引擎会漏词、加词、把 `it's` 写成 `its`、把 `20` 听成 `twenty`，
逐字比对会让 80 分的朗读变成 20 分。这里用的是**词级最长公共子序列（LCS）**：

1. 两边都规范化：小写、去标点、删撇号、数字词统一成数字。
2. 跑 LCS，标记目标句里哪些词被「按顺序」读到了。
3. `score = 匹配数 / 目标词数 × 100`。

| 情况 | 结果 |
| --- | --- |
| 全读对，标点大小写不同 | 100 分 |
| 7 个词读对 5 个 | 71 分（≥ 70 算通过） |
| 多读了词 | 不扣分，多出来的忽略 |
| 顺序说反 | 只算前半段匹配 |
| 完全不相干 | 0 分 |

界面上逐词标绿 / 划红，直接看出漏了哪个词。**音频不出设备** —— 识别在浏览器里完成，
服务端只收到一个分数。

> 读什么：语块读本体；单词和句型读第一个例句。只读 `make` 这种单词，识别必然满分，测了个寂寞。

### 移动端朗读静音的坑（已修）

用户报告「手机上按朗读没声音」。根因有三个，都集中在 `speechSynthesis`：

1. **`cancel()` 同步紧跟 `speak()` 会把自己掐掉** —— iOS / 部分安卓里，前一句没清完就播新句，
   表现就是「按了没声」。修法：先 `cancel()`，再用 `setTimeout(150ms)` 隔开一帧再 `speak()`。
2. **不显式选 voice，部分设备静默失败** —— 安卓首次 `getVoices()` 为空，必须监听 `voiceschanged`
   缓存 voice 列表，朗读时按 `lang` 精确匹配英文 voice。
3. **iOS 第一句经常被静默丢掉** —— `onstart` 始终不触发。修法：用 `speakToken` 兜底，
   700ms 还没真正开播就补播一次，同一时刻只允许最新一次补播，不会叠音。

统一收进 `frontend/src/lib/speech.ts` 的 `speakText()`，学习页「听一遍」和词库「朗读」都改调它。
`speakText()` 返回 `false` 时按钮自动禁用并提示「当前浏览器不支持朗读」。

**自主择优语音**：`pickVoice()` 给每个可用语音打分（精确 `lang` 匹配权重最高，再叠加
neural / enhanced / Samantha / Google US English / Microsoft 神经语音等质量关键词），
自动挑最自然的那一个。这样不再用设备默认可能很机器人的语音，且无需用户手动选。

---

## AI 剪藏怎么工作

「词库 → AI 剪藏」或「我的 → AI 剪藏」，贴一段英文（120–6000 字符），
模型会挑 6-8 张值得学的卡，勾选后导入成**你自己的私有卡片**（`owner_id` = 你，`source` = `ai-clip`）。

```bash
node scripts/check-clip.mjs   # 命令行跑一遍：解析 → 打印 → 导入 → 重复导入验证去重
node scripts/cdp-clip.mjs     # 浏览器里跑一遍并截图
```

**模型回退链**（`worker/src/routes/clip.ts`）：

| 顺序 | 模型 | 实测 |
| --- | --- | --- |
| 1 | `llama-3.3-70b-instruct-fp8-fast` | 8-10s / 6-7 张，质量最稳 |
| 2 | `llama-4-scout-17b-16e-instruct` | 13s / 3 张，偏保守 |
| 3 | `qwen3-30b-a3b-fp8` | 12s / 3 张 |
| 4 | `mistral-small-3.1-24b-instruct` | 26s / 8 张，最全但慢 |

踩过的坑都写在代码注释里，这里列三个最要命的：

- **返回结构不统一**。同一批模型，有的把正文放 `choices[0].message.content`（顶层 `response` 是空串），
  有的才用 `response`。只读 `response` 的后果不是报错，而是**悄悄降级到最差的模型** ——
  主力全被判成 empty，最后 llama-3.2-3b 给你编几张假卡。`readAiText()` 两种都认。
- **`max_tokens` 写大了会直接失败**。这几个模型单次输出上限 2048，写 4096 报错；
  那就靠「少出卡 + 每张 1-2 个例句」压住输出，超了还有 `repairTruncatedJson()` 兜底 ——
  它按括号栈找到最后一个安全截断点补齐，**哪怕模型正写到第三个例句的半句话就断了，
  前面完整的卡也能全救回来**。
- **`type` 可能是中文**。prompt 是中文写的，模型很自然回「单词 / 语块 / 句型」，
  只认英文枚举的话整批卡会被静默丢掉。`normalizeType()` 一并认。

质量上还有一条硬规则：**单词卡必须收成词典原形**（原文 `clarifying` → 卡面 `clarify`）。
不这么做，用户复习的是变形，学不到词根。

导入按 `owner_id + content` 去重，同一段话反复剪不会把词库灌满。

---

## 打卡提醒怎么发

每天 **UTC 11:30（北京 19:30）** 由 Cron Trigger 触发 `scheduled()`（`worker/src/index.ts`）：

1. 取所有 `reminder_enabled = 1` 且 `reminder_webhook` 非空的用户。
2. 按**各自时区**算出「今天」，查到期卡片数 `due` 和今日已复习数 `done`。
3. `done > 0` 直接跳过 —— **今天学过就不打扰**，这是整个功能的分寸所在。
4. 既没到期卡也没新词可学，也跳过。
5. 否则 POST 一条文本到群机器人。

**配置方式**：在群里添加「群机器人」，复制 webhook 地址，粘到「我的 → 每日提醒」。

| 平台 | 域名 | 报文格式 |
| --- | --- | --- |
| 企业微信 | `qyapi.weixin.qq.com` | `{ msgtype: 'text', text: { content } }` |
| 钉钉 | `oapi.dingtalk.com` | 同上 |
| 飞书 | `open.feishu.cn` / `open.larksuite.com` | `{ msg_type: 'text', content: { text } }` |

> **为什么要白名单**：这个 URL 由用户填、由服务端发起请求，不限制就是个 SSRF 口子
> （`http://169.254.169.254/` 之类）。`isAllowedWebhook()` 要求 https + 域名在白名单内，
> 非法地址在保存时就被拒，不会等到 cron 跑起来才发现。

提醒文案长这样（`buildReminderText()`，纯函数）：

```
小林，今天的英语还差一点 📚
有 12 张卡片到复习时间了，过一遍大约 5 分钟。
连续打卡 7 天，继续保持。
https://eyu.letsgo.cc.cd
```

最后那行读的是 `SITE_URL`，换域名只改 `wrangler.toml`，不用动代码。

---

## 数据库

4 张表 + 1 个视图，详见 `worker/schema.sql`：

- `users` — 账号、时区、每日新词/复习上限、提醒开关与 webhook
- `cards_master` — 词/语块/句型主表；`frequency_rank` 决定新词顺序；`owner_id` 为 NULL 是公共词库，非 NULL 是用户私有卡片（Phase 3 剪藏产物）
- `user_cards` — 每用户每卡一行，SM-2 状态（stage / EF / interval / next_review_at / lapses）
- `review_logs` — 每次作答一行，带 `review_date`（用户本地日期），是热力图与正确率的唯一数据源
- `v_due_cards` — `user_cards JOIN cards_master`，Worker 直接查它拿「到期卡片 + 内容」

> 在原需求 Schema 基础上增加了：`frequency_rank`、`tags`、`owner_id`、`first_seen_date`、`review_logs` 表、
> 以及 `user_cards(user_id, card_id)` 唯一索引 —— 前几项是「按频次发词」「私有卡片」「每日限额」「打卡统计」的必要条件。

---

## 注意事项

- **免费额度**：Workers 10 万请求/天、D1 5GB、KV 10 万读/天，个人或小圈子够用。
- **Workers AI 也有免费额度**：每天 10,000 neurons，够几十次剪藏。超了 `/api/clip/analyze`
  会返回 `ai_unavailable`，等第二天恢复；不要在页面上轮询它。
- **Cron 一天只跑一次**：Cloudflare 不保证秒级准时，误差几分钟正常，错过就等第二天。
  想改时间就调 `wrangler.toml` 里的 `crons`（注意是 UTC）。
- **PBKDF2 与 CPU 上限**：免费计划单请求 10ms CPU，10 万次迭代的 PBKDF2 可能逼近上限。
  若注册/登录偶发 `1102` 错误，把 `PBKDF2_ITERATIONS` 调到 `50000`（已写入哈希串，调低不影响老用户登录）。
- **JWT_SECRET 必须换**：`wrangler secret put JWT_SECRET`，不要用仓库里的开发值。
- **令牌有效期 7 天**：过期后自动跳登录页；登出会删除 KV 会话，令牌立即失效。
- **`GET /queue` 有副作用**：会把新词写入 `user_cards`（每天首次进入学习页时发放），不要在前端轮询它。

---

## 下一步预留

- `review_logs.mode` 已能记 `recall | cloze | order | speak`；新增题型只需加一个组件，服务端无需改表。
- **数据导出**（Phase 3c）：`user_cards JOIN cards_master` 直接吐 CSV，含 SM-2 状态与全部复习记录。
- **剪藏进阶**：`/api/clip/analyze` 已支持 6000 字符；下一步可以吃 URL（`fetch` + 正文提取）或 PDF。
- **提醒频率**：目前一天一次；`buildReminderText()` 是纯函数，想加「连续 3 天没学才提醒」这类策略只改它。
- **口语测评**：`scoreSpeech()` 只用了 LCS，想更严可以加音素级比对（需要换识别引擎）。
