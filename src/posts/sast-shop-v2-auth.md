---
title: 七天写一个飞书登录——SAST Shop v2 开发日志
date: 2026-06-14
tags: [Go, OAuth, 微服务, Redis]
description: 在 SAST Shop v2 负责飞书 OAuth 认证模块的开发记录。从手写 HTTP 客户端到切官方 SDK，再到完整的用户登录链路与前端 JSAPI 鉴权。
---

## 背景

SAST Shop v2 是团队用 Go 重写的商城，微服务架构，ConnectRPC 做服务间通信。项目骨架由 AIden 搭好，基础设施（config、redis、logger、PostgreSQL）已就位。

我负责飞书 OAuth 认证和用户服务模块——用户通过飞书账号登录，后端处理 token 缓存、账号管理和登录会话。

下面是按天还原的开发过程。

---

## Day 1：Redis 缓存 key 与 HTTP 客户端骨架

项目启动第二天，AIden 的微服务骨架和 payment 初始代码已经就位。`internal/pkg` 下有统一的 config、redis、logger、bun/postgres 等包，服务模块放在 `internal/service/{name}` 下独立部署。

第一个 commit：`chore: update go.sum`。引入新依赖后把依赖解析和功能代码拆开提交，review 时不用在 hash 变更里筛选业务逻辑。

飞书开放平台有三种 token 需要缓存：

- `app_access_token`：应用级，用于无需用户授权的接口
- `tenant_access_token`：租户级，权限范围更大
- `jsapi_ticket`：前端 JSSDK 签名票据

在 `constant.go` 定义 Redis key：

```go
FeishuAppTokenKey    = "feishu:app_token"
FeishuTenantTokenKey = "feishu:tenant_token"
FeishuJSAPITicketKey = "feishu:jsapi_ticket"
```

前缀用 `feishu` 而非具体服务名，因为飞书 token 是项目级共享资源。服务 A 缓存的 token，服务 B 直接用，避免各自请求飞书 API。这个设计在后续接入官方 SDK 时得到了验证——SDK 的缓存适配器同样按项目级别共享。

HTTP 客户端骨架：

```go
const baseURL = "https://open.feishu.cn/open-apis"

type Client struct {
    httpClient *http.Client
}

var DefaultClient = NewClient()

func NewClient() *Client {
    return &Client{
        httpClient: &http.Client{Timeout: 10 * time.Second},
    }
}
```

包级单例 `DefaultClient` 复用 `http.Client` 的连接池。超时 10 秒——飞书 API 通常 200ms 返回，留出余量应对网络抖动。

---

## Day 2：postJSON 通用请求工具

实现 `postJSON` 方法，之后所有飞书 API 调用都走这条路径。

飞书 API 的统一外层响应格式：

```go
type apiResponse struct {
    Code int    `json:"code"`
    Msg  string `json:"msg"`
}
```

`code == 0` 表示成功。

`postJSON` 的签名：`headers` 用 `map[string]string` 而非 `http.Header`，调用方通常只需传 `Authorization: Bearer xxx`。`body` 和 `out` 为 `any`，由 `json.Marshal/Unmarshal` 处理序列化。

错误分层：

1. JSON 序列化失败 → 代码问题，直接返回
2. HTTP 请求构建失败 → 同上
3. HTTP 状态码 >= 400 → `"feishu http %d: %s"`，飞书服务端异常
4. 飞书 code != 0 → `"feishu api error %d: %s"`，业务错误
5. 响应反序列化失败 → 格式不符合预期

每层错误带明确前缀——HTTP 层用 `"feishu http"`，业务层用 `"feishu api error"`。排查问题时根据前缀即可定位层级。

中途遇到一个问题：最初把 `apiResponse` 设计为包含 `Data json.RawMessage` 字段，假设飞书所有接口的业务数据都在 `data` 字段内。查文档后发现不一致——`app_access_token` 的返回字段在响应顶层（`app_access_token` 和 `expire`），而 `authen/v1` 和 `jssdk` 的字段在 `data` 内。

修正：删除 `Data` 字段，将整个响应体原始 JSON 传给 `out`。调用方自行定义结构体，字段在哪层就定义在哪层。

---

## Day 3：引入官方 SDK 替换自定义客户端

上午处理 token 缓存读写，下午获取两种 access token，晚上用官方 SDK 替换了前两天写的自定义客户端。

### token 缓存读写

飞书 token 有效期约两小时，需要 Redis 缓存。`getCachedToken` 从 Redis 取值：

```go
func getCachedToken(ctx context.Context, key string) (string, bool, error) {
    ctx = pkgredis.WithProjectPrefixOnly(ctx)
    token, err := pkgredis.Client.Get(ctx, key).Result()
    if err == goredis.Nil {
        return "", false, nil
    }
    if err != nil {
        return "", false, err
    }
    return token, true, nil
}
```

三参数返回值 `(string, bool, error)` 区分三种状态：有 token、未命中缓存、Redis 故障。作为对比，`(string, error)` + 哨兵错误会把"未命中"和"Redis 挂了"混在 error 中，调用方需要 `errors.Is` 判断。两种写法各有利弊，这个场景下三参数版本调用方的分支逻辑更直观。

### 缓存过期策略

`GetAppAccessToken` 流程：查缓存 → 命中返回 → 未命中调飞书 API → 写入缓存。`GetTenantAccessToken` 同理。

写入缓存的 TTL 计算：

```go
ttl := time.Duration(expireInSec-60) * time.Second
if ttl < 60*time.Second {
    ttl = 60 * time.Second
}
```

飞书返回的 `expire` 是 token 在飞书侧的有效秒数。Redis TTL 设为 `expire - 60 秒`，预留 60 秒缓冲。原因是服务器时钟偏差（NTP 同步存在误差）可能导致 Redis 认为 token 有效而飞书侧已过期，请求被拒。60 秒缓冲覆盖了常规的时钟偏移范围。兜底 `ttl = 60 * time.Second` 防止飞书返回过短过期时间导致 TTL 接近零。

### 切换到官方 SDK

手写客户端可以正常工作，但飞书 API 有上百个，每个都手写 `postJSON` 加结构体定义效率低。此外 `user_access_token`、`refresh_token`、token 自动刷新等功能还需自行实现。引入官方 SDK `github.com/larksuite/oapi-sdk-go/v3`。

SDK 内置 token 自动管理（`EnableTokenCache=true`）。需要实现 `larkcore.Cache` 接口，将缓存载体从默认内存 map 换为项目 Redis：

```go
type RedisCache struct{}

var _ larkcore.Cache = RedisCache{}

func (RedisCache) Set(ctx context.Context, key, value string, expireTime time.Duration) error {
    ctx = pkgredis.WithProjectPrefixOnly(ctx)
    return pkgredis.Client.Set(ctx, key, value, expireTime).Err()
}

func (RedisCache) Get(ctx context.Context, key string) (string, error) {
    ctx = pkgredis.WithProjectPrefixOnly(ctx)
    value, err := pkgredis.Client.Get(ctx, key).Result()
    if err == goredis.Nil {
        return "", nil
    }
    return value, err
}
```

两个细节：

`var _ larkcore.Cache = RedisCache{}` 是编译期接口断言。SDK 升级变更 `Cache` 接口时编译直接报错，不会留到运行时。对接第三方库时，该惯用法可在编译期暴露接口不匹配问题。

`Get` 中 Redis 返回 `Nil` 时返回 `("", nil)` 而非 `("", error)`。SDK 通过返回值是否为空串判断缓存命中，不依赖 error。若返回 error，SDK 会将缓存读取失败视为异常，可能跳过 token 刷新。

接入效果：

```text
client.go: 91 行 → 30 行
token.go:  100 行 → 删除
```

手写的 `getCachedToken`、`setCachedToken`、`GetAppAccessToken`、`GetTenantAccessToken` 均由 SDK 接管。手写阶段的积累——60 秒缓冲策略、项目级 key 共享、未命中与故障的区分——在评估 SDK 能力和配置适配器时直接作用于决策。

### 初始化到所有服务 & JSAPI 修复

在 `catalogservice`、`errandservice`、`paymentservice`、`spotservice` 四个服务的 `main.go` 中各加 `feishu.Init()`，置于 `config.Init()` 和 `redis.Init()` 之后。

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
        lark.WithReqTimeout(10*time.Second),
    )
}
```

配置缺失直接 `panic`。飞书认证是核心依赖，启动时 fail-fast 比运行中每个请求报 500 更容易定位。`panic` 的堆栈信息比 `log.Fatal` 更完整。

飞书常量集中到 `constant.go`，修复 JSAPI 签名的边界处理。

---

## Day 4：SDK 整合收尾 + 用户仓库层

### 清理遗留代码

SDK 接管 token 管理后，`setCachedSelfBuiltTenantAccessToken` 和 `sdkSelfBuiltTenantAccessTokenKey` 没有调用方，删除。

`randomNonce()` 仅 `SignURL` 一处调用，内联到调用处。单一调用方的私有函数内联后减少跳转，`rand.Read(buf)` 本身足够清晰。

`ExchangeCode` 增加 `redirectURI` 参数。此前硬编码从配置读回调地址，改为参数传入后支持多环境部署——调用方按请求 Host 头动态构造回调地址。

增加 access_token 空值校验：SDK 返回的 `AccessToken` 若为空串直接报错。按飞书文档规范此异常不应出现，但作为防御性检查成本很低。

删除未被调用的 `BuildAuthorizationURL`。

### 用户仓库层

用 bun ORM 操作 PostgreSQL。

`GetUserByFeishuOpenID` 按飞书 openID 查用户。用户不存在时返回 `(nil, nil)` 而非 `(nil, error)`——区分"未注册"和"数据库故障"：

```go
func GetUserByFeishuOpenID(ctx context.Context, openID string) (*model.UserAccount, error) {
    var user model.UserAccount
    err := postgres.DB.NewSelect().Model(&user).Where("feishu_open_id = ?", openID).Scan(ctx)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    return &user, nil
}
```

调用方逻辑：`user == nil` 走注册，`user != nil` 走登录，`err != nil` 走降级。

`UpsertUser`：已存在则更新昵称、头像、最后登录时间，不存在则 INSERT 新用户，默认 `role: user`、`status: active`。仅更新四个字段——角色和状态由管理员后台控制，不在登录时覆盖。

### 登录态缓存

新增 `SaveUserCache`，key 格式 `user_cache:{userID}`，TTL 与 session 一致。网关鉴权流程：请求 token → Redis session 查 userID → Redis user cache 查 AuthUser → 判断角色和状态。两次 Redis 查询完成鉴权，无需每次调用户服务查数据库。

---

## Day 5：AuthSession

新增 `CreateAuthSession`，每次登录记录一条会话：

| 字段 | 说明 |
|------|------|
| userID | 登录用户 |
| refreshTokenHash | 飞书 refresh_token 的 SHA256 摘要，非明文 |
| status | active / revoked / expired |
| expiresAt | 绝对过期时间，默认 30 天 |

refresh_token 存 hash——安全级别等同于密码。验证时重新计算 hash 对比。

status 三种状态：`active`（有效中）、`revoked`（主动登出或被踢下线）、`expired`（自然过期）。区分 revoked 和 expired 便于审计——日志中可区分"自然死"和"被杀"。

---

## Day 6：后端自签 Token

用户服务核心逻辑：`generateToken`、`buildAuthUser`、`toLoginMember`。

### 为什么不用飞书的 token

飞书 OAuth 回调后拿到飞书的 access_token 和 refresh_token，但不应暴露给前端：

1. 飞书 token 可调用飞书 API（通讯录、消息等），泄露影响范围大
2. 过期时间由飞书控制，业务侧无法按需失效（如管理员踢人下线）
3. 与飞书版本耦合，token 格式或验证逻辑变更影响前端

后端自签 token：

```go
func generateToken() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return hex.EncodeToString(b), nil
}
```

32 字节 `crypto/rand` → 64 字符 hex。前端视为不透明凭证，每次请求携带，后端去 Redis 查真实鉴权信息。

### AuthUser 结构

```go
type AuthUser struct {
    UserID      int64
    Role        string   // user / admin / superadmin
    Status      string   // active / restricted / banned / deleted
    AccessToken string   // 飞书 user_access_token，后端调飞书 API 使用
}
```

Role 和 Status 纳入鉴权上下文，网关无需调用用户服务即可判断权限。AccessToken 存储飞书的 user_access_token，供后端以用户身份调飞书 API。

### toLoginMember

`model.UserAccount` → Proto `LoginMember` 映射。数据层不依赖 Proto，Proto 层不感知数据库字段。

---

## Day 7：登录门禁

`checkUserCanLogin`——飞书认证通过后、生成 token 前执行的状态检查：

```go
func checkUserCanLogin(u *model.UserAccount) error {
    if u.Status == model.MemberStatusRestricted ||
       u.Status == model.MemberStatusBanned ||
       u.Status == model.MemberStatusDeleted {
        return rpcerror.NewInternalError(&commonv1.BusinessError_UserError{
            UserError: &userv1.UserError{
                Code: userv1.UserErrorCode_USER_ERROR_CODE_INTERNAL_ERROR,
            },
        }, fmt.Sprintf("user account is %s", u.Status))
    }
    return nil
}
```

日志中包含具体状态值便于排查；前端返回通用错误码 `USER_ERROR_CODE_INTERNAL_ERROR`，不暴露用户实际状态。

不在 SQL 查询中直接过滤 `WHERE status = 'active'` 的原因：需要区分"用户不存在"和"用户存在但状态异常"。前者走注册流程，后者走拒绝登录。SQL 层过滤会导致两种状态混在一起，被封禁用户可能被引导至注册流程，存在绕过封禁的风险。状态判断放在应用层，两条路径明确隔离。

---

## Day 8：Login 流水线与 JSAPI 鉴权

Day 7 把登录链路上各个环节的函数都写好了——`ExchangeCode`、`GetCurrentUser`、`UpsertUser`、`checkUserCanLogin`、`generateToken`、`SaveSession`。但 Handler 层还是两个桩：

```go
return nil, rpcerror.NewInternalError(..., "To be implemented")
```

今天把这两个桩补上。

### Login 流水线

`Login` 方法是整个认证模块的入口，把前面七天写的所有函数串成一条流水线：

```go
func Login(ctx context.Context, req *userv1.LoginRequest) (*userv1.LoginResponse, error) {
    // 1. 用飞书授权码换 token
    feishuToken, err := feishu.ExchangeCode(ctx, req.Code, "", req.GetRedirectUri())

    // 2. 用飞书 token 获取当前用户信息
    userInfo, err := feishu.GetCurrentUser(ctx, feishuToken.AccessToken)

    // 3. 创建或更新本地用户记录
    user, err := repository.UpsertUser(ctx, userInfo.OpenID, userInfo.Name, userInfo.AvatarURL)

    // 4. 状态门禁
    if err := checkUserCanLogin(user); err != nil { ... }

    // 5. 生成后端自签 token
    sessionToken, err := generateToken()

    // 6. 写 session 和 user cache 到 Redis
    store.SaveSession(ctx, sessionToken, authUser)
    store.SaveUserCache(ctx, authUser)

    // 7. 返回
    return &userv1.LoginResponse{
        AccessToken: sessionToken,
        ExpiresIn:   int32(constant.SessionTTL.Seconds()),
        Member:      toLoginMember(user),
    }, nil
}
```

流水线的每一步失败都有明确的错误信息：`"feishu exchange code"`、`"feishu get current user"`、`"upsert user"`、`"generate token"`、`"save session"`。线上排查时看到日志就知道哪一步挂了，不用翻代码。

错误包装统一用 `userError` 辅助函数，返回 `USER_ERROR_CODE_INTERNAL_ERROR` 给前端，同时在日志中保留原始错误信息——对外不暴露内部细节，对内保留排查线索。

两个 Redis 写入操作不是事务的。如果 `SaveSession` 成功但 `SaveUserCache` 失败，用户实际上已经登录（网关能查到 session），但 user cache 缺失会导致网关判权时多一次数据库查询。不算致命，但后续可以优化——比如用 Redis pipeline 批量写入，或者加一个异步补写逻辑。

### GetJSAPIAuthConfig

前端飞书 JSSDK 初始化需要四个参数：`appId`、`timestamp`、`nonceStr`、`signature`。这些由后端通过 `SignURL` 生成：

```go
func GetJSAPIAuthConfig(ctx context.Context, url string) (*userv1.GetJSAPIAuthConfigResponse, error) {
    sig, err := feishu.SignURL(ctx, url)
    if err != nil {
        return nil, rpcerror.NewInternalError(..., fmt.Sprintf("feishu sign url: %v", err))
    }
    return &userv1.GetJSAPIAuthConfigResponse{
        AppId:     sig.AppID,
        Timestamp: sig.Timestamp,
        NonceStr:  sig.NonceStr,
        Signature: sig.Signature,
    }, nil
}
```

`SignURL` 内部依赖 `GetJSAPITicket`，而 `GetJSAPITicket` 在 Day 4 的优化中已经加上了缓存失败日志和空值防御。前端的调用时机是在飞书授权页跳转之前——先拿到签名配置，初始化 JSSDK，再引导用户授权。签名有效期为 ticket 的有效期（约 2 小时），足够覆盖一次登录流程。

两个 Handler 补齐之后，认证模块的 RPC 接口全部就位——`Login` 和 `GetJSAPIAuthConfig` 对前端暴露，`ExchangeCode`、`SignURL` 等底层逻辑封装在 service 层。

---

## 总结

完整链路：

```text
前端获取 JSAPI 签名 → 飞书授权页 → 回调 → 换 token → 获取用户 → Upsert → 门禁 → 自签 token → 写 session/cache → 返回
                                                                                              ↓
                                                                                GetJSAPIAuthConfig（签名）
```

关键转折在 Day 3：手写的 160 行客户端代码被 23 行 SDK Init 替代。手写阶段中对 token 过期策略、缓存 key 设计、故障与未命中的区分等细节的理解，直接影响了后续 SDK 适配器的设计和对 SDK 默认行为的评估。

认证模块两端至此打通——前端通过 `GetJSAPIAuthConfig` 获取 JSSDK 签名、拉起飞书授权，后端通过 `Login` 完成全链路处理并返回自签 token。后续工作是接入网关层的鉴权拦截器，让 token 真正生效。
