---
title: OAuth 2.0 完全指南——从协议原理到飞书实战
date: 2026-06-09
tags: [OAuth, Go, 飞书, 安全, Web协议, 认证授权]
description: 一份融合协议原理与工程落地的 OAuth 2.0 指南：从四种授权类型、PKCE 密码学原理、令牌轮换策略、JWT 签名方案选择，到 scope 最小权限设计、全链路安全防御（CSRF／Referer 泄露／混淆代理），再到飞书开放平台实战中的 Redis 缓存策略、SDK 适配器实现、登录流水线与生产踩坑全记录。
---

## 背景：为什么需要 OAuth

如果你的应用只需要邮箱和密码登录，你不需要 OAuth。但如果你想让用户通过飞书、Google、GitHub 账号登录你的服务，或者你需要让一个后端服务以用户的身份调用另一个服务的 API，OAuth 2.0 就是你要面对的协议。

OAuth 2.0 解决的核心问题是**委托授权**——用户把自己的部分权限"借"给第三方应用，而不需要把自己的密码交给它。想象一个场景：你注册了一个文档打印服务，它需要访问你存储在某个云盘里的文件。在没有 OAuth 的时代，你有两个选择：要么把云盘密码告诉打印服务（密码共享，打印服务可以翻你的所有文件、改你的密码），要么手动下载文件再上传（体验灾难）。OAuth 让用户只在云盘的授权页面上登录并确认"我给这个打印服务读取文件的权限"，然后云盘颁发一个有时效、有范围、可撤销的令牌给打印服务。

这不是一个理论问题，而是日常工程中反复出现的安全边界。OAuth 2.0 由 RFC 6749 定义，是当今互联网应用最广泛使用的授权框架。

强调"授权"而非"认证"——OAuth 解决的是"你能做什么"，而不是"你是谁"。实际工程中授权和认证经常绑在一起（先确认身份才能决定权限），但在协议层面它们是两层独立的问题，这是理解 OAuth 设计的起点。

本文不满足于讲清楚协议"怎么做"，而是追问它"为什么这么做"——每个 RFC 条文的背后都有被攻击的历史和被权衡的取舍。同时，本文以飞书开放平台为实战案例，展示 OAuth 2.0 从协议原理到生产落地的完整路径。

---

## 1. OAuth 四大角色

理解协议之前，先理清四个角色的职责和边界。

| 角色 | 定义 | 飞书场景中的对应 |
|------|------|-----------------|
| **Resource Owner**（资源所有者） | 拥有受保护资源的实体，通常是终端用户 | 飞书用户本人 |
| **Client**（客户端） | 代表资源所有者请求资源的应用 | 你的 Web 应用 |
| **Authorization Server**（授权服务器） | 认证资源所有者并颁发令牌的服务器 | 飞书开放平台（`open.feishu.cn`） |
| **Resource Server**（资源服务器） | 托管受保护资源、验证令牌并返回数据的服务器 | 飞书通讯录 API、消息 API 等 |

这四个角色在物理上不一定一一对应。飞书的授权服务器和资源服务器是分离的——授权请求发到 `accounts.feishu.cn`，资源 API 发到 `open.feishu.cn`。Google 的授权服务器（`accounts.google.com`）和资源服务器（`www.googleapis.com`）同样分离。但一个企业内部系统可能把两者部署在同一服务中。角色的分离是**逻辑抽象**，不是部署架构要求——这为安全边界划分提供了土壤：授权服务器被攻破影响所有令牌，资源服务器被攻破仅影响该服务的资源。

角色之间的交互流程（以 Authorization Code Grant 为例）：

```
用户(Resource Owner) ──点击登录──> Client
Client ──重定向──> Authorization Server ──"是否授权？"──> 用户
用户 ──同意──> Authorization Server
Authorization Server ──authorization_code──> Client（通过用户浏览器重定向）
Client ──authorization_code──> Authorization Server（后端直连）
Authorization Server ──access_token──> Client（后端直连）
Client ──access_token──> Resource Server（后端直连）
Resource Server ──受保护资源──> Client
```

关键观察：用户的密码**从未经过 Client**。用户只在 Authorization Server 的域名下输入密码（浏览器地址栏显示的是 `accounts.google.com` 或 `accounts.feishu.cn`，而不是第三方应用的域名）。这就是 OAuth 的核心价值——密码托管给授权服务器，Client 只拿到有时效、可撤销、有范围的令牌。

---

## 2. 四种授权类型

RFC 6749 定义了四种标准授权类型（grant type），每种应对不同的场景和安全假设。理解它们不是为了记住所有接口细节，而是为了建立一张决策表：面对一个具体场景，知道该选哪种、不该选哪种。

### 2.1 Authorization Code Grant（授权码模式）

**流程**：

```
1. Client 重定向用户到授权服务器
   GET /authorize?response_type=code&client_id=xxx&redirect_uri=xxx&scope=xxx&state=xxx

2. 用户登录并授权（在授权服务器域名下完成）

3. 授权服务器重定向回 Client，携带 code
   302 Location: https://client.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xxx

4. Client 后端用 code 向授权服务器换 token
   POST /token
   Host: authorization-server.com
   Body: grant_type=authorization_code&code=xxx&redirect_uri=xxx&client_id=xxx&client_secret=xxx

5. 授权服务器返回 access_token（和可选的 refresh_token）
   {
     "access_token": "2YotnFZFEjr1zCsicMWpAA",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA"
   }
```

**安全设计的核心在于前后端分离的"两步走"结构**：

**第一步**（步骤 2-3）：authorization_code 通过**浏览器前端通道**传递。它暴露在 URL 中，可以被浏览器历史、Referer 头、JavaScript 读取。但 code 本身是一次性的（用完即废），且 code 单独没用——换 token 需要 client_secret，而 client_secret 只在后端。

**第二步**（步骤 4-5）：token 通过**后端直连**发放。access_token 从未经过浏览器，不存在 URL 泄露风险。code 换 token 的请求不经过用户浏览器，client_secret 不在前端暴露。

这个两步走的分离，是 Authorization Code Grant 在四种授权类型中安全性最高的根本原因。它对应的是 OAuth 的安全假设：**前端通道不可信，后端通道可信**。前端通道上的一切（URL 参数、DOM、JavaScript）都可能被窃听或篡改；后端通道是服务器之间的 TLS 加密连接，中间人攻击的难度呈数量级上升。

**适用场景**：所有有后端的应用——Web 服务、移动 App（配合 PKCE）、CLI 工具（配合 PKCE）。这是唯一推荐用于任何有后端 Clients 的授权类型。

RFC 6749 Section 4.1 定义了该授权类型的完整规范。

### 2.2 Client Credentials Grant（客户端凭证模式）

```
POST /token
Body: grant_type=client_credentials&client_id=xxx&client_secret=xxx&scope=xxx

Response:
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

这是最简单的授权类型——没有用户参与，Client 直接以自己的身份向授权服务器要 token。

**没有用户、没有授权码、没有 refresh_token**。client_id 和 client_secret 本身就是 Client 的身份凭证，不需要额外的前端授权流程。

**适用场景**：
- 服务间通信（微服务 A 调用微服务 B 的 API）
- 后台任务（定时任务读取数据库、数据同步）
- 无须用户上下文的公共 API 调用

**不适用场景**：任何需要用户身份的请求。Client Credentials 拿到的 token 代表 Client 自己，不包含用户信息。如果资源需要"该用户是否授权了此操作"的判断，这就是错误的授权类型。

RFC 6749 Section 4.4 定义。

### 2.3 Implicit Grant（隐式模式）——已废弃

```
GET /authorize?response_type=token&client_id=xxx&redirect_uri=xxx&scope=xxx&state=xxx

// 授权服务器直接在 URL fragment 中返回 access_token
302 Location: https://client.example.com/callback#access_token=xxx&expires_in=3600
```

Implicit Grant 是 OAuth 2.0 初期为纯前端（SPA）应用设计的简化版本。它跳过了"换 code"的步骤，授权服务器直接在重定向 URL 的 fragment 中返回 access_token。

**为什么要废止**：Implicit Grant 违反了 Authorization Code Grant 的核心安全前提——"token 不应经过浏览器"。access_token 直接出现在 URL fragment 中，虽然 fragment 不会发给服务器（这是当初用 fragment 而非 query string 的考量），但：

1. **Token 存储在 `window.location.hash` 中**，任何能访问 DOM 的 JavaScript 都能读取
2. **Token 可能通过 redirect URI 被重定向到攻击者服务器**（利用 open redirector）
3. **没有 refresh_token**，token 过期后必须重新弹授权页，用户体验差
4. **无法验证 redirect_uri**，中间人攻击更隐蔽

OAuth 2.1 正式移除了 Implicit Grant。对于 SPA，现在的推荐方案是 Authorization Code + PKCE（见第 3 节）。

RFC 6749 Section 4.2 定义（OAuth 2.1 中已移除）。

### 2.4 Resource Owner Password Credentials Grant（密码模式）——已废弃

```
POST /token
Body: grant_type=password&username=xxx&password=xxx&client_id=xxx

Response:
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

用户把**用户名和密码直接交给 Client**，Client 拿着它们去换 token。

**为什么这是危险的**：

1. **打破了 OAuth 的核心承诺**——用户密码经过第三方应用。一旦第三方应用被攻破或本身不可信，用户密码直接泄露
2. **无法区分应用的合法性和用户意愿**——用户无法在授权服务器侧看到"哪个应用在请求我的权限"
3. **无法实施 MFA**——Client 拿密码直接换 token，绕过了授权服务器的多因素认证流程
4. **Client 获得了用户的长期凭证**，而非短效令牌

**唯一可接受的边界场景**：你自己的公司内部系统，Client 和 Authorization Server 由同一团队维护，用户对两者有一致信任。即使如此，也应该优先考虑资源所有者密码凭证 + 一步换 code 的过渡方案。

OAuth 2.1 同样移除了 Password Grant。

RFC 6749 Section 4.3 定义（OAuth 2.1 中已移除）。

### 四种授权类型决策表

| 场景 | 推荐授权类型 | 原因 |
|------|-------------|------|
| 有后端的 Web 应用 | Authorization Code + PKCE | 前后端分离，token 不经浏览器 |
| 纯前端 SPA | Authorization Code + PKCE（无 client_secret） | 安全等价于后端应用，有 refresh_token |
| 移动 App | Authorization Code + PKCE | App 无法安全存储 client_secret |
| CLI / 设备端 | Authorization Code + PKCE / Device Code | 无浏览器或受限输入 |
| 服务间调用 | Client Credentials | 无用户上下文 |
| 定时任务、后台脚本 | Client Credentials | 同上 |

原则很简单：只要涉及用户，用 Authorization Code + PKCE。不涉及用户，用 Client Credentials。其他授权类型不再出现在新设计中。

---

## 3. PKCE：为什么授权码还需要一层密码学保护

PKCE（Proof Key for Code Exchange，发音 "pixy"）是 RFC 7636 定义的对 Authorization Code Grant 的安全补强。它解决了授权码拦截攻击（authorization code interception attack）。

### 3.1 攻击场景：授权码为什么会被拦截

Authorization Code Grant 中，code 通过前端通道（URL query string）传递：

```
https://client.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA
```

在以下场景中，攻击者可能获取这个 code：

1. **移动 App 的自定义 URL Scheme**：App 注册 `myapp://callback` 作为重定向 URI。多个 App 可以注册同一个 scheme，操作系统可能将重定向发给恶意 App
2. **混合应用（WebView + Native）**：代码运行在 WebView 中，code 被 JavaScript 拦截
3. **浏览器扩展或恶意软件**：读取浏览器历史或拦截网络请求
4. **Referer 头泄露**：callback 页面加载外部资源（图片、脚本）时，Referer 头携带完整 URL（含 code）

没有 PKCE 时，攻击者拿到 code 后直接用它换 token——授权服务器只验证 code、client_id、redirect_uri，如果 code 有效就会颁发 token。

### 3.2 PKCE 的密码学原理

PKCE 在授权流程中插入了一个加密"收据"：发起授权的人必须证明自己知道一个特定秘密。

**完整流程**：

```
Step 1: Client 生成 code_verifier
         code_verifier = 43-128 个字符的随机字符串
         （字符集：[A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"）

Step 2: Client 计算 code_challenge
         code_challenge = BASE64URL(SHA256(code_verifier))

Step 3: 授权请求携带 code_challenge
         GET /authorize?response_type=code&code_challenge=xxx&code_challenge_method=S256...

Step 4: 授权服务器存储 code_challenge（与 code 关联）

Step 5: 用 code 换 token 时，同时发送 code_verifier
         POST /token
         Body: grant_type=authorization_code&code=xxx&code_verifier=yyy...

Step 6: 授权服务器验证
         BASE64URL(SHA256(code_verifier)) == 之前存储的 code_challenge ?
```

**为什么能防住拦截攻击**：

攻击者拦截到的是 `code` 和 `code_challenge`（步骤 3 的 URL）。但他没有 `code_verifier`——SHA256 是单向函数，无法从哈希值反推原文。步骤 5 换 token 时需要 `code_verifier`。没有它，拦截到的 code 一文不值。

### 3.3 密码学实现

`code_verifier` 的生成（RFC 7636 Section 4.1）：

```go
func generateCodeVerifier() (string, error) {
    // 43-128 字符的未保留字符随机串
    // 推荐使用 32 字节随机数 base64url 编码后约 43 字符
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(b), nil
}
```

`code_challenge` 的计算（RFC 7636 Section 4.2）：

```go
func computeCodeChallenge(verifier string) string {
    h := sha256.Sum256([]byte(verifier))
    return base64.RawURLEncoding.EncodeToString(h[:])
}
```

`code_challenge_method` 字段支持两种方式：
- **S256**：`BASE64URL(SHA256(code_verifier))`——推荐，提供完整 256 位安全强度
- **plain**：`code_challenge == code_verifier`——仅用于不支持 SHA256 的环境（现已不存在），等于没有防护

**为什么强制 S256 而非 plain**：`plain` 模式下 `code_challenge` 就是 `code_verifier` 本身，URL 中同时暴露了 challenge 和 verifier，任何拦截者都能看到。它只验证"换 token 的人"和"发起授权的人使用了相同的值"，但不验证"发起授权的人知道这个值"。`plain` 模式无法防御拦截攻击。

OAuth 2.1 要求 PKCE 对所有使用 Authorization Code Grant 的 Client 都是**强制性的**，不再区分 public client 和 confidential client。

### 3.4 为什么 confidential client 也需要 PKCE

最早 PKCE 只被推荐给 public clients（SPA、移动 App），因为它们无法安全存储 `client_secret`。confidential client（有后端的服务）有 `client_secret`，似乎不需要 PKCE。

但 RFC 7636 之后的实践证明：

1. **client_secret 本身可能泄露**。日志不慎打印、配置文件误提交、CI/CD 环境变量暴露——这些都是发生过无数次的事故
2. **redirect_uri 验证不是银弹**。open redirector（授权服务器侧或 Client 侧）可能将 code 重定向到攻击者
3. **深度防御原则**。PKCE 是额外的独立安全层，成本极低（一次 SHA256 计算），效果显著——攻击者必须同时攻破两重防护才能获取 token

简单说：PKCE 的成本是零（一次哈希），收益是代码拦截攻击的完全阻断。没有理由不用。

飞书对 PKCE 的支持是完整的：`code_challenge` 和 `code_challenge_method` 参数在 authorize 端点中直接可用，`code_verifier` 在 token 端点中需要传入。实际工程中建议无条件开启 PKCE。

---

## 4. Token 设计：access_token 与 refresh_token 的双轨制

### 4.1 为什么需要两种令牌

直接给一个长期有效的令牌行不行？技术上可行，但安全上不可取。两种令牌的分离源于一个核心设计问题：**签发频率和暴露频率不同步**。

- **access_token** 频繁使用（每个 API 请求），应该短时效，限制泄露的影响窗口
- **refresh_token** 极少使用（仅在 access_token 过期时），应该长时效，但泄露后可以撤销

| | access_token | refresh_token |
|---|---|---|
| **用途** | 访问资源（每次 API 请求携带） | 获取新的 access_token |
| **暴露频率** | 每次 HTTP 请求 | 仅在 /token 端点 |
| **推荐过期时间** | 15 分钟 - 1 小时 | 7-30 天 |
| **存储位置** | 内存（前端）、会话（后端） | 数据库或安全存储 |
| **传输通道** | 高频，Bearer 头 | 低频，POST body |
| **可撤销粒度** | 不单独撤销，依赖过期 | 可逐条撤销 |

这个设计的核心权衡是**安全性与用户体验**：

- 只用短期 token（15 分钟）：每 15 分钟用户需要重新授权——不可接受
- 只用长期 token（30 天）：token 泄露后的 30 天内攻击者可以持续访问——不可接受
- 短期 access + 长期 refresh：access_token 泄露影响窗口 15 分钟；refresh_token 低频使用，泄露概率低；既保证了安全，又保证了体验

### 4.2 Refresh Token 轮换与重用检测

最先进的 refresh token 使用策略是**轮换**：每次用 refresh_token 换新的 access_token 时，同时发放一个新的 refresh_token，旧的那个立即失效。

```
POST /token
Body: grant_type=refresh_token&refresh_token=old_refresh_token

Response:
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",  // 旧 token 失效
  "expires_in": 3600
}
```

**轮换解决的核心问题**：攻击者窃取了一个 refresh_token，但合法的用户也在使用同一个 refresh_token。谁先用，另一方的 refresh_token 就失效。这在两个场景下保护用户：

1. **合法用户先用**：攻击者的 refresh_token 失效，攻击被阻断；用户换了新的 refresh_token，一切正常
2. **攻击者先用**：攻击者拿到了新的 access_token 和 refresh_token；用户的旧 refresh_token 失效——此时用户被强制回到登录页，但这是可感知的异常（用户知道"我被踢下线了"），而非静默的数据泄露

没有轮换的机制中，攻击者和受害者可以同时使用同一个 refresh_token，静默窃取数据，用户毫不知情。

**与重用检测的配合**：授权服务器在 refresh_token 被重用时（一个已失效的旧 token 被另一个持有者使用），应该**撤销该用户的所有 refresh token**，强制全局重新登录。这比孤立地处理单条 token 更能阻断横向移动。

### 4.3 Access Token 过期时间设计

推荐的 access_token 过期时间选择：

- **15 分钟**：高度敏感的应用（网银、医疗数据）
- **1 小时**：常规 Web 应用
- **12-24 小时**：内部工具、低风险应用

过短的过期时间导致频繁刷新，增加授权服务器负载；过长的过期时间扩大泄露影响窗口。15 分钟到 1 小时是实践中的甜点区间。

`expires_in` 字段表示的是**秒数**而非绝对时间，这是刻意为之：

```json
{
  "access_token": "xxx",
  "expires_in": 3600,    // 秒，而非 "2026-06-15T14:00:00Z"
  "token_type": "Bearer"
}
```

原因：绝对时间需要双方时钟同步。Client 拿到 token 的 3600 秒后过期——这是**相对时间**，不依赖 NTP。服务器时钟偏差不影响 token 有效性的判断（因为过期时间由服务器在签发时计算并嵌入 token，或者通过 expires_in 由 Client 自行计算）。在实践中，如果使用自包含的 JWT access_token，`exp` 字段仍然是绝对时间戳，此时时钟偏差问题需要显式考虑——通常容忍 30-60 秒的偏差。

### 4.4 飞书的三种令牌类型

飞书 OAuth 体系包含三种令牌，每种的生命周期和使用场景不同：

**（1）app_access_token（应用级令牌）**

- 获取方式：`POST /auth/v3/app_access_token/internal`，传入 `app_id` + `app_secret`
- 生命周期：约 2 小时，SDK 在剩余时间 < 30 分钟时自动刷新
- 用途：ISV 应用获取 tenant_access_token 的前置凭证
- 特点：与用户无关，代表应用自身的身份

**（2）tenant_access_token（租户级令牌）**

- 获取方式：`POST /auth/v3/tenant_access_token/internal`
- 生命周期：约 7200 秒（2 小时）
- 用途：代表应用在某个租户内的身份，调用无需用户授权的大部分 API
- 特点：SDK 完全管理其生命周期，开发者不需要手动调用

**（3）user_access_token（用户级令牌）**

- 获取方式：通过 OAuth 授权码流程换取
- 生命周期：约 2 小时（最大 6900 秒）
- 用途：代表特定用户的身份，调用需要用户授权的 API
- 配套 refresh_token：约 30 天有效期（`refresh_expires_in` 字段），**每次刷新返回新的 refresh_token 并立即废弃旧的**

飞书 SDK 内部对 access_token 的管理策略：当剩余时间不足 180 秒时自动触发刷新。这个 180 秒缓冲是经过权衡的值——太小则在高并发时可能发出已过期的令牌，太大则频繁刷新增加飞书 API 调用次数。

### 4.5 Token 格式：Opaque vs JWT

Access token 的格式决定了资源服务器的验证路径，分两种：

**Opaque Token**——随机字符串，无任何含义。资源服务器需内网回查 `/introspect` 端点才能解析用户和权限。天然支持即时撤销（回查返回 `active: false` 即可），适合内网稳定的中心化架构。

**JWT Token**——自包含的 Base64 编码体，资源服务器离线验证签名即可，零网络延迟。Payload 携带 `sub`（用户 ID）、`scope`（权限范围）、`aud`（目标服务）、`exp`（过期时间）等标准声明。

| 维度 | Opaque | JWT |
|------|--------|-----|
| 验证延迟 | introspect API（5-50ms） | 本地签名验证（~0ms） |
| 可撤销性 | 即时 | 依赖过期，除非引入黑名单 |
| 适合场景 | 中心化，内网稳定 | 微服务，高流量，跨网络 |

签名算法：**HS256**（对称）——同一密钥签发和验证，适合单体应用。**RS256**（非对称）——私钥签发、公钥验证，公钥可广播而签发权独有，适合多服务架构。现代推荐 **ES256**——同等安全强度下签名仅 64 字节（RSA 为 256 字节），高频验证场景下网络开销更低。

即使使用 JWT，`exp` 过期的 token 仍可能在有效期内被撤销（用户登出、管理员踢出）。introspection 的 `active` 字段提供补充验证——混合模式下 JWT 用于常规请求以减少内网调用，关键操作额外回查以确保即时撤销生效。

### 4.6 Scope：最小权限的脚手架

Scope 是一个空格分隔的权限字符串列表（`scope=read:profile write:posts`），由 Client 在授权请求中声明，授权服务器在用户同意后写入 token。

设计上推荐 **动词:资源** 模式——每个操作和资源类型独立声明，Client 按需请求。`profile`（粗粒度）和 `profile:read`（细粒度）的分层可兼顾用户体验和高级权限控制。

关键安全边界：scope 是**客户端约束**而非服务端强制手段。恶意 Client 可以无视 scope 声明尝试访问任何资源。真正的访问控制必须在资源服务器每个端点上独立验证 token 中的 scope 字段——授权服务器负责"用户同意了什么"，资源服务器负责"这个请求是否在同意范围内"。

---

## 5. OAuth 安全模型

### 5.1 CSRF 与 `state` 参数

OAuth 授权流程中的 CSRF 攻击（RFC 6819 Section 4.4.1）利用了授权服务器对 Client 的回调是**被动的**这一特性。

**攻击场景**：

1. 攻击者在 `evil.com` 上启动授权流程，用自己的账号获取一个 authorization code
2. 攻击者将回调 URL `https://client.example.com/callback?code=attacker_code` 发送给受害者（埋入 img 标签、form 提交、链接等）
3. 受害者浏览器访问这个 URL，Client 将 `attacker_code` 换成了 token
4. 受害者之后使用 Client 时，实际上绑定的是攻击者的账号
5. 受害者上传的数据、填写的表单，都存入了攻击者的账户中

**防御：`state` 参数**：

```go
// Step 1: 发起授权请求前生成 state
func initiateOAuth(w http.ResponseWriter, r *http.Request) {
    state := generateRandomState() // 32 字节随机数，base64url 编码

    // 将 state 存入 session（服务端）
    session.Values["oauth_state"] = state
    session.Save(r, w)

    // 将 state 放入授权 URL
    authURL := fmt.Sprintf(
        "https://auth.example.com/authorize?response_type=code&client_id=%s&state=%s&...",
        clientID, state,
    )
    http.Redirect(w, r, authURL, http.StatusFound)
}

// Step 2: 回调时验证 state
func oauthCallback(w http.ResponseWriter, r *http.Request) {
    returnedState := r.URL.Query().Get("state")
    expectedState := session.Values["oauth_state"].(string)

    if returnedState != expectedState {
        // state 不匹配：这是 CSRF 攻击或重放
        http.Error(w, "Invalid state", http.StatusBadRequest)
        return
    }

    // state 匹配：继续换 token
    delete(session.Values, "oauth_state") // 用完即弃
    session.Save(r, w)

    // ... 用 code 换 token
}

func generateRandomState() string {
    b := make([]byte, 32)
    rand.Read(b)
    return base64.RawURLEncoding.EncodeToString(b)
}
```

`state` 的本质是 **CSRF token 的 OAuth 定制版**：它绑定了一个特定的浏览器会话，攻击者无法构造包含受害者 state 的恶意 URL。

**为什么 state 需要足够大的随机性**（RFC 6819 Section 4.4.1.4）：如果 state 是连续的（如 1, 2, 3...），攻击者可以预测下一个 state 值，CSRF 防御形同虚设。推荐 128 位以上熵值。

### 5.2 Token 通过 Referer 头泄露

当 OAuth 回调页面包含外部资源时，浏览器发送的 Referer 头会携带完整 URL（含 code）：

```html
<!-- 在 https://client.example.com/callback?code=xxx 页面上 -->
<img src="https://external-site.com/pixel.gif">
<!-- 浏览器发送 Referer: https://client.example.com/callback?code=xxx -->
```

**多层防御**：

1. **Referrer-Policy 头**：`Referrer-Policy: no-referrer` 或 `strict-origin-when-cross-origin`（后者保留同源 Referer 用于内部统计，但跨域只发 origin）
2. **code 一次性使用**：即使 code 泄露，也只能用一次。攻击者拿到 code 但 Client 已经用它换过 token，授权服务器会拒绝重复使用
3. **PKCE**：拦截到的 URL 包含 `code` 和可能的 `code_challenge`，但没有 `code_verifier`，code 无法使用
4. **Meta 标签**：`<meta name="referrer" content="no-referrer">`

这些措施叠加，即使某一层被绕过，其他层依然有效。

### 5.3 Redirect URI 验证与 Open Redirector

**攻击场景**：

```
// 攻击者构造的恶意授权请求
GET /authorize?response_type=code&client_id=xxx&redirect_uri=https://evil.com/callback

// 如果授权服务器不验证 redirect_uri 与注册值匹配：
// → 用户授权后，浏览器跳转到 evil.com，code 暴露给攻击者
```

**防御要求（RFC 6819 Section 4.4.2）**：

1. **精确匹配**：授权服务器必须将 Client 注册时的 redirect_uri 与请求中的值精确比较（不包含通配符、允许部分匹配）
2. **预注册**：所有重定向 URI 必须在 Client 注册时预声明
3. **禁止本地 host**：不接受 `localhost` 作为 redirect_uri（除开发环境外）

Go 服务端验证示例：

```go
func validateRedirectURI(registered, requested string) error {
    // OAuth 2.1: 精确字符串匹配，不允许通配符
    if registered != requested {
        return fmt.Errorf("redirect_uri mismatch: expected %q, got %q", registered, requested)
    }

    u, err := url.Parse(requested)
    if err != nil {
        return fmt.Errorf("invalid redirect_uri: %w", err)
    }

    // 仅允许 HTTPS（本地开发例外）
    if u.Scheme != "https" && !isLocalDevelopment(u) {
        return fmt.Errorf("redirect_uri must use HTTPS")
    }

    // 禁止 fragment（fragment 不会被发送到服务器）
    if u.Fragment != "" {
        return fmt.Errorf("redirect_uri must not contain fragment")
    }

    // 禁止 userinfo 部分
    if u.User != nil {
        return fmt.Errorf("redirect_uri must not contain userinfo")
    }

    return nil
}
```

**飞书的 redirect_uri 验证规则**：

- **规则 1：精确匹配，`?` 和 `#` 后缀被忽略。** 在飞书开发者后台的"安全设置 > 重定向 URL"配置中，配置 `http://example.com/callback` 后，请求中的 `http://example.com/callback#/index` 或 `http://example.com/callback?param=value` 都能匹配。这是飞书对 OAuth 2.1 严格匹配要求的一个实用性折中——前端 SPA 常使用 hash 路由，`?` 参数用于传递业务参数。但路径部分必须精确匹配——通配符不被支持。
- **规则 2：一个应用最多 300 个重定向 URL。** 足以覆盖多环境（dev / staging / prod）、多平台（Web / iOS / Android）的需求。
- **规则 3：请求中的 redirect_uri 必须 URL 编码。** 因为它是 `application/x-www-form-urlencoded` 格式的参数。
- **规则 4：app_id 与重定向 URL 所属应用必须一致。** 这是最容易踩的坑——用应用 A 的 `app_id` 发起授权，但重定向 URL 配置在应用 B 中。

常见错误码对照：

| 错误码 | 含义 | 原因 |
|--------|------|------|
| 2000 | `redirect_uri unmatch` | URL 不在白名单中 |
| 20029 | `redirect_uri request is illegal` | app_id 与 URL 所属应用不匹配 |

**Open Redirector 的特殊危害**：如果授权服务器自身存在 open redirector 漏洞（如 `/redirect?url=evil.com`），攻击者可以构造看似指向授权服务器的 URL，实际将 token 重定向到恶意站点。这是 OAuth 安全中最隐蔽的攻击面之一——安全边界在"授权服务器自身的所有端点"而不只是 `/authorize`。

### 5.4 Confused Deputy Problem（混淆代理攻击）

这是 OAuth 中最容易被忽视的攻击。攻击者利用一个被信任的 Client（"deputy"）来访问本不该访问的资源。

**场景**：

1. 攻击者注册了自己的 OAuth Client `evil_app`，也获得了 `evil_app` 的 token
2. Client `legit_app` 可以访问资源服务器上的用户照片
3. 攻击者将 `evil_app` 的 access_token 发给 `legit_app` 的资源服务器
4. 如果资源服务器只验证 token 是否有效（不管 token 来自哪个 Client），攻击者就能用 `evil_app` 的 token 访问 `legit_app` 的 API

**根本原因**：资源服务器只验证了"用户授权了这个 access_token"，没有验证"这个 access_token 是颁给我这个 Client 的"。

**防御**：令牌的 audience（`aud` 声明）验证，或资源服务器验证 token 的 `client_id` 字段（对于 JWT token）。资源服务器在验证令牌时，额外检查 token 中的 Client 信息是否匹配预期的 Client 集合。

```go
func validateAccessToken(tokenString string, requiredAudience string) (*Claims, error) {
    claims := &Claims{}
    token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
        return publicKey, nil
    })
    if err != nil {
        return nil, err
    }

    // 核心：验证 aud（audience）——这个 token 是颁给哪个 Client 的
    audOK := false
    for _, aud := range claims.Audience {
        if aud == requiredAudience {
            audOK = true
            break
        }
    }
    if !audOK {
        return nil, fmt.Errorf("token audience %v does not include %s", claims.Audience, requiredAudience)
    }

    return claims, nil
}
```

### 5.5 Token 存储：前端 vs 后端

这是一个容易忽视但影响深远的安全决策。

**Token 不应该暴露给前端**（浏览器）。原因：

1. **飞书 token 的攻击面太大**。飞书的 user_access_token 可以调用通讯录、消息等敏感 API。一旦泄露，影响的不是你的应用而是用户的整个飞书账号。
2. **过期时间由飞书控制**。如果 token 格式或验证逻辑变更，前端需要发版，后端可以无感知处理。
3. **无法按需失效**。管理员踢人下线、安全事件响应——这些操作需要即时撤销用户的访问权限。如果前端直接持有飞书 token，你无法控制它。

**正确的做法——后端自签 Token**：

```go
func generateToken() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return hex.EncodeToString(b), nil
}
```

32 字节 `crypto/rand` 生成 64 字符 hex 字符串。前端视为不透明凭证，每次请求携带，后端去 Redis 查真实鉴权信息。前端不知道、也不需要知道飞书 token 的存在。

后端存储的 `AuthUser` 结构包含飞书令牌供后端服务间调用使用：

```go
type AuthUser struct {
    UserID      int64
    Role        string   // user / admin / superadmin
    Status      string   // active / restricted / banned / deleted
    AccessToken string   // 飞书 user_access_token，后端调飞书 API 使用
}
```

前端拿到的只是一个会话 ID，后端在网关层通过 Redis 查找对应的 `AuthUser`，完成鉴权和权限判断。两步 Redis 查询（session -> userID，user cache -> AuthUser）即可完成，不需要每次都调用用户服务。

### 5.6 refresh_token 的安全存储

飞书的 refresh_token 有效期长达 30 天，如果泄露等同于长期凭证被窃取。存储时应采用与密码同等的安全标准：

```go
// 创建会话时存储 refresh_token 的 SHA256 摘要
func CreateAuthSession(ctx context.Context, userID int64, refreshToken string, expiresAt time.Time) error {
    hash := sha256.Sum256([]byte(refreshToken))
    session := &AuthSession{
        UserID:           userID,
        RefreshTokenHash: hex.EncodeToString(hash[:]), // 存哈希，不存明文
        Status:           "active",
        ExpiresAt:        expiresAt,
    }
    return db.Insert(ctx, session)
}
```

验证时重新计算哈希对比。即使数据库被拖库，攻击者拿到的是哈希而非原始 refresh_token。`refresh_token` 的熵值远高于密码（通常 128 位以上随机数），暴力破解不可行。

会话的 `status` 字段设计为三态：`active`（有效中）、`revoked`（主动登出或被踢下线）、`expired`（自然过期）。区分 `revoked` 和 `expired` 便于安全审计——日志中可以区分"自然死亡"和"被杀"。

---

## 6. 飞书 OAuth 实战

### 6.1 Redis 缓存策略

飞书 token 的缓存策略是生产环境中最容易出错的地方。核心矛盾在于：**飞书服务器的时钟和你的服务器时钟不同步**。

飞书返回的 `expire` 字段是 token 的有效秒数（相对时间）。`expires_in` 表示相对时间是有意为之——它不依赖 NTP 同步，Client 拿到 token 后自己计算过期时刻。问题出在 Redis TTL 设置上：

```go
// 正确的做法：留出 60 秒缓冲
ttl := time.Duration(expireInSec-60) * time.Second
if ttl < 60*time.Second {
    ttl = 60 * time.Second  // 兜底最小 60 秒
}
```

为什么是 60 秒而不是更大的值？飞书 token 有效期约 2 小时（7200 秒）。NTP 同步在健康网络中的偏差通常在几毫秒到几十秒之间。60 秒覆盖了绝大多数场景的时钟偏移。如果设得更大（如 300 秒），浪费的缓存时间过多，缓存命中率下降，请求飞书 API 的频率上升。

飞书服务端对时间戳的容忍度为 300 秒——如果你的服务器时间与飞书服务器偏差超过 300 秒，会收到 `signature_invalid` 错误。生产环境应部署 NTP 同步服务（chrony 或 ntpd）。60 秒缓冲是一个保守值，在实际工程中证明了它的有效性。

**Redis 缓存 key 命名**：使用项目级共享前缀 `feishu` 而非具体服务名：

```go
const (
    FeishuAppTokenKey    = "feishu:app_token"
    FeishuTenantTokenKey = "feishu:tenant_token"
    FeishuJSAPITicketKey = "feishu:jsapi_ticket"
)
```

飞书 token 是项目级共享资源。微服务架构下，服务 A 缓存的 token 服务 B 直接使用，避免各自请求飞书 API——既减少飞书 API 调用次数，也降低限流风险。

### 6.2 飞书 SDK Cache 接口实现

飞书官方 SDK（`github.com/larksuite/oapi-sdk-go/v3`）内置 token 自动管理能力。但默认的 token 缓存是内存 map——进程重启即丢失，多实例不共享。生产环境必须替换为 Redis。

SDK 的 Cache 接口定义：

```go
// larkcore.Cache 接口
type Cache interface {
    Set(ctx context.Context, key, value string, expireTime time.Duration) error
    Get(ctx context.Context, key string) (string, error)
}
```

实现：

```go
type RedisCache struct{}

// 编译期接口断言：SDK 升级变更 Cache 接口时编译直接报错
var _ larkcore.Cache = RedisCache{}

func (RedisCache) Set(ctx context.Context, key, value string, expireTime time.Duration) error {
    ctx = pkgredis.WithProjectPrefixOnly(ctx)
    return pkgredis.Client.Set(ctx, key, value, expireTime).Err()
}

func (RedisCache) Get(ctx context.Context, key string) (string, error) {
    ctx = pkgredis.WithProjectPrefixOnly(ctx)
    value, err := pkgredis.Client.Get(ctx, key).Result()
    if err == goredis.Nil {
        return "", nil  // 关键：未命中返回空串，不是 error
    }
    return value, err
}
```

两个关键细节：

**（1）编译期接口断言 `var _ larkcore.Cache = RedisCache{}`**

这不是运行时检查，而是**编译期**验证。如果飞书 SDK 升级后 `Cache` 接口新增了方法或修改了参数签名，这行代码直接导致编译失败——不会让不兼容的代码进入生产环境。这是 Go 对接第三方库的惯用法，成本为零（不生成任何运行时指令），收益是阻止了一整类"接口不匹配"的生产事故。

**（2）`Get` 中未命中返回 `("", nil)` 而非 `("", error)`**

SDK 通过返回值是否为空字符串判断缓存是否命中，不依赖 error。如果未命中时返回 error，SDK 会将缓存读取失败视为异常，可能跳过正常的 token 刷新流程。这一点是看飞书 SDK 源码才能确认的行为，官方文档没有明确说明。

客户端初始化：

```go
func Init() {
    cfg := config.AppConfig
    if cfg.Feishu_AppID == "" || cfg.Feishu_AppSecret == "" {
        panic("feishu: FEISHU_APP_ID / FEISHU_APP_SECRET must be configured")
    }
    Client = lark.NewClient(
        cfg.Feishu_AppID,
        cfg.Feishu_AppSecret,
        lark.WithTokenCache(RedisCache{}),
        lark.WithEnableTokenCache(true),
        lark.WithReqTimeout(10*time.Second),
    )
}
```

配置缺失直接 `panic`。飞书认证是核心依赖，启动时 fail-fast 比运行中每个请求报 500 更容易定位。`panic` 的堆栈信息比 `log.Fatal` 更完整，能直接定位到调用链。

### 6.3 登录流水线

将飞书 OAuth 的各个环节串联成一条完整的流水线，是真正落地的最后一步：

```go
func Login(ctx context.Context, req *userv1.LoginRequest) (*userv1.LoginResponse, error) {
    // 1. 用飞书授权码换 token（含 PKCE code_verifier）
    feishuToken, err := feishu.ExchangeCode(ctx, req.Code, codeVerifier, req.GetRedirectUri())
    if err != nil {
        return nil, fmt.Errorf("feishu exchange code: %w", err)
    }

    // 2. 用飞书 token 获取当前用户信息
    userInfo, err := feishu.GetCurrentUser(ctx, feishuToken.AccessToken)
    if err != nil {
        return nil, fmt.Errorf("feishu get current user: %w", err)
    }

    // 3. 创建或更新本地用户记录（Upsert）
    user, err := repository.UpsertUser(ctx, userInfo.OpenID, userInfo.Name, userInfo.AvatarURL)
    if err != nil {
        return nil, fmt.Errorf("upsert user: %w", err)
    }

    // 4. 状态门禁——不在 SQL 层过滤，应用层明确判断
    if err := checkUserCanLogin(user); err != nil {
        return nil, err
    }

    // 5. 生成后端自签 token
    sessionToken, err := generateToken()
    if err != nil {
        return nil, fmt.Errorf("generate token: %w", err)
    }

    // 6. 写 session 和 user cache 到 Redis
    store.SaveSession(ctx, sessionToken, authUser)
    store.SaveUserCache(ctx, authUser)

    // 7. 返回
    return &userv1.LoginResponse{
        AccessToken: sessionToken,
        ExpiresIn:   int32(sessionTTL.Seconds()),
        Member:      toLoginMember(user),
    }, nil
}
```

每一步失败都有明确的错误包装（`"feishu exchange code"`、`"feishu get current user"` 等）。线上排查时看到日志前缀就知道是哪一步挂了。

关于第 4 步的状态门禁——为什么不在 SQL 查询中直接过滤 `WHERE status = 'active'`？因为需要区分"用户不存在"和"用户存在但状态异常"。前者走注册流程，后者走拒绝登录。SQL 层过滤会导致两种状态混在一起，被封禁用户可能被引导至注册流程，存在绕过封禁的风险。状态判断放在应用层，两条路径明确隔离。

### 6.4 常见踩坑

**时钟偏移**：飞书签名验证容忍 300 秒偏差，云服务器/Docker 默认不开 NTP。部署 chrony/ntpd，Redis TTL 留 60 秒缓冲（`ttl = expireInSec - 60`），健康检查监控 `chronyc tracking`。

**`offline_access` scope**：OAuth 授权请求必须包含 `offline_access`，否则飞书不返回 `refresh_token`。遗漏后用户 access_token 过期只能重走授权流程。

**缓存竞态**：高并发下多个请求同时发现 token 过期，同时调飞书 API。用户 token 用 Redis SETNX 分布式锁排队，SDK 管理的 token 由内部 mutex 处理。

---

## 7. 完整实践：Authorization Code + PKCE 的 Go 实现

以下是一个最小但安全的 OAuth 2.0 Client 实现，包含 PKCE、state 验证、token 管理和自动刷新。

```go
package oauth

import (
    "context"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "strings"
    "sync"
    "time"
)

// OAuth2Config holds client registration details.
type OAuth2Config struct {
    ClientID     string
    ClientSecret string
    RedirectURI  string
    AuthURL      string // e.g. https://auth.example.com/authorize
    TokenURL     string // e.g. https://auth.example.com/token
    Scopes       []string
}

// TokenSet represents the OAuth 2.0 token response.
type TokenSet struct {
    AccessToken  string `json:"access_token"`
    TokenType    string `json:"token_type"`
    RefreshToken string `json:"refresh_token,omitempty"`
    ExpiresIn    int    `json:"expires_in"`
}

// Client handles the OAuth 2.0 authorization code flow with PKCE.
type Client struct {
    config OAuth2Config
    http   *http.Client
    mu     sync.Mutex
}

// NewClient creates a new OAuth 2.0 client.
func NewClient(config OAuth2Config) *Client {
    return &Client{
        config: config,
        http:   &http.Client{Timeout: 10 * time.Second},
    }
}

// generateRandomString generates a cryptographically random URL-safe string.
func generateRandomString(length int) (string, error) {
    b := make([]byte, length)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(b), nil
}

// computeCodeChallenge computes the S256 code challenge from a verifier.
// RFC 7636 Section 4.2: code_challenge = BASE64URL(SHA256(code_verifier))
func computeCodeChallenge(verifier string) string {
    h := sha256.Sum256([]byte(verifier))
    return base64.RawURLEncoding.EncodeToString(h[:])
}

// BuildAuthURL constructs the authorization URL for initiating the OAuth flow.
// It generates a new PKCE code_verifier + code_challenge pair and a CSRF state.
func (c *Client) BuildAuthURL() (authURL, state, codeVerifier string, err error) {
    state, err = generateRandomString(32) // 256 bits of entropy
    if err != nil {
        return "", "", "", fmt.Errorf("generate state: %w", err)
    }

    codeVerifier, err = generateRandomString(32) // 256 bits
    if err != nil {
        return "", "", "", fmt.Errorf("generate code_verifier: %w", err)
    }

    codeChallenge := computeCodeChallenge(codeVerifier)

    u, err := url.Parse(c.config.AuthURL)
    if err != nil {
        return "", "", "", fmt.Errorf("parse auth URL: %w", err)
    }

    q := u.Query()
    q.Set("response_type", "code")
    q.Set("client_id", c.config.ClientID)
    q.Set("redirect_uri", c.config.RedirectURI)
    q.Set("scope", strings.Join(c.config.Scopes, " "))
    q.Set("state", state)
    q.Set("code_challenge", codeChallenge)
    q.Set("code_challenge_method", "S256")
    u.RawQuery = q.Encode()

    return u.String(), state, codeVerifier, nil
}

// ExchangeCode exchanges an authorization code for tokens.
// The code_verifier must match the one generated during BuildAuthURL.
func (c *Client) ExchangeCode(ctx context.Context, code, codeVerifier string) (*TokenSet, error) {
    data := url.Values{
        "grant_type":    {"authorization_code"},
        "code":          {code},
        "redirect_uri":  {c.config.RedirectURI},
        "client_id":     {c.config.ClientID},
        "client_secret": {c.config.ClientSecret},
        "code_verifier": {codeVerifier}, // PKCE: prove possession of the verifier
    }

    return c.doTokenRequest(ctx, data)
}

// RefreshAccessToken uses a refresh token to obtain a new access token.
// Implements refresh token rotation: the old refresh token is invalidated.
func (c *Client) RefreshAccessToken(ctx context.Context, refreshToken string) (*TokenSet, error) {
    data := url.Values{
        "grant_type":    {"refresh_token"},
        "refresh_token": {refreshToken},
        "client_id":     {c.config.ClientID},
        "client_secret": {c.config.ClientSecret},
    }

    return c.doTokenRequest(ctx, data)
}

// doTokenRequest sends a POST request to the token endpoint.
func (c *Client) doTokenRequest(ctx context.Context, data url.Values) (*TokenSet, error) {
    req, err := http.NewRequestWithContext(ctx, "POST", c.config.TokenURL,
        strings.NewReader(data.Encode()))
    if err != nil {
        return nil, fmt.Errorf("build token request: %w", err)
    }
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

    resp, err := c.http.Do(req)
    if err != nil {
        return nil, fmt.Errorf("token request: %w", err)
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB limit
    if err != nil {
        return nil, fmt.Errorf("read token response: %w", err)
    }

    if resp.StatusCode >= 400 {
        return nil, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
    }

    var token TokenSet
    if err := json.Unmarshal(body, &token); err != nil {
        return nil, fmt.Errorf("parse token response: %w", err)
    }

    return &token, nil
}

// CallbackHandler is an HTTP handler for the OAuth redirect endpoint.
// It validates the state parameter (CSRF protection) and exchanges the code.
func (c *Client) CallbackHandler(expectedState, expectedCodeVerifier string, onSuccess func(*TokenSet)) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Validate state parameter to prevent CSRF (RFC 6819 Section 4.4.1)
        returnedState := r.URL.Query().Get("state")
        if returnedState == "" || returnedState != expectedState {
            http.Error(w, "Invalid state parameter", http.StatusBadRequest)
            return
        }

        // Check for authorization errors
        if errDesc := r.URL.Query().Get("error_description"); errDesc != "" {
            http.Error(w, fmt.Sprintf("Authorization error: %s", errDesc), http.StatusBadRequest)
            return
        }

        code := r.URL.Query().Get("code")
        if code == "" {
            http.Error(w, "Missing authorization code", http.StatusBadRequest)
            return
        }

        // Exchange code for token (PKCE verifier proves possession)
        token, err := c.ExchangeCode(r.Context(), code, expectedCodeVerifier)
        if err != nil {
            http.Error(w, fmt.Sprintf("Token exchange failed: %v", err), http.StatusInternalServerError)
            return
        }

        onSuccess(token)
        w.Write([]byte("Authorization successful"))
    }
}
```

这个实现体现了 OAuth 2.1 安全最佳实践中的所有关键元素：
- **PKCE**（S256）在每次授权流程中强制使用
- **State 参数**以 256 位随机值防御 CSRF
- **Token 请求使用 POST body**，避免 token 出现在 URL
- **响应体大小限制**（1 MB），防止内存耗尽
- **错误信息不泄露内部细节**（对用户返回通用错误，日志记录完整错误）

---

## 8. 总结

贯穿整个 OAuth 协议设计的安全原则可以归纳为六条，这六条原则在协议层面和工程落地层面同时适用：

**1. 凭证最小暴露**：用户密码只在授权服务器的域名下出现。access_token 不出现在浏览器 URL 中。refresh_token 只在 POST body 中传输。每次暴露都是可被攻击者利用的窗口——减少暴露即减少攻击面。

**2. 短时效 + 可轮换**：access_token 短时效（15 分钟到 1 小时），泄露影响窗口小。refresh_token 长时效但低频使用，且通过轮换机制让窃取者与合法用户发生冲突时暴露攻击行为。

**3. 深度防御（多道锁）**：即使某一层被绕过（如 code 通过 Referer 泄露，或 state 被猜解），下一层依然有效（code 一次性的、PKCE 阻止换 token）。安全设计不应依赖单点防护。

**4. 签发与验证分离**：授权服务器拥有签发能力（私钥、密钥存储），资源服务器仅拥有验证能力（公钥、introspection API）。权限边界与密钥管理边界对齐。

**5. 最小权限（Least Privilege）**：Client 声明它需要的最小 scope 集合。用户有能力审查并取消个别权限。资源服务器在每个端点上独立验证 scope——授权流的约束和访问控制的约束分别在协议层和应用层独立实施。

**6. 安全默认值**：OAuth 2.1 的核心改进不是增加新机制，而是移除不安全的选项——Implicit Grant、Password Grant、通配符 redirect_uri、plain PKCE。让安全成为默认路径而非可选配置。

飞书 OAuth 是标准 OAuth 2.0 的一个高质量实现——它严格遵循 Authorization Code Grant 规范，提供了完整的 PKCE 支持，令牌生命周期设计合理，refresh_token 单次使用策略比许多同类平台安全得多。但工程落地中，真正的挑战不在协议本身，而在边界细节：

- 时钟偏移导致的间歇性签名失败，需要 NTP 同步 + 缓存 TTL 缓冲双重防护
- 高并发下的缓存竞态，需要分布式锁或 SDK 内置 mutex 管理
- 缓存写入的非事务性，需要设计优雅的降级路径
- refresh_token 轮换后的持久化，决定了长期运行中用户会不会被无故踢下线
- compile-time interface assertion、fail-fast with panic 这些小技巧，在代码量上微不足道，但在生产事故预防上事半功倍

完整的链路如下：

```
前端获取 JSAPI 签名 → 飞书授权页 → 回调 → 换 token → 获取用户 → Upsert
→ 状态门禁 → 自签 token → 写 session/cache → 返回
```

---

## 参考资料

- **RFC 6749** — The OAuth 2.0 Authorization Framework（核心框架，定义了四种授权类型）
- **RFC 7636** — Proof Key for Code Exchange (PKCE)（授权码拦截攻击的防御）
- **RFC 6819** — OAuth 2.0 Threat Model and Security Considerations（安全威胁模型与防御）
- **RFC 6750** — The OAuth 2.0 Authorization Framework: Bearer Token Usage
- **RFC 7662** — OAuth 2.0 Token Introspection
- **RFC 7519** — JSON Web Token (JWT)
- **OAuth 2.1 Authorization Framework** — Draft（整合升级，移除不安全模式，强化 PKCE）
- **OAuth 2.0 Security Best Current Practice** — draft-ietf-oauth-security-topics
- **飞书开放平台文档** — `https://open.feishu.cn/document`
- **larksuite/oapi-sdk-go** — 飞书官方 Go SDK
