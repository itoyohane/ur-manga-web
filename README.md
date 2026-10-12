# 漫画私藏 · ur-manga-web

选择最喜欢的长篇、中篇、短篇和同人漫画，生成个人推荐卡。每类最多一部，可留空；篇幅由用户自行归类。

源代码仓库：https://github.com/itoyohane/ur-manga-web

## 本地运行

使用 Node.js 22 或更新版本，无需安装依赖或构建。克隆仓库后运行：

```bash
git clone https://github.com/itoyohane/ur-manga-web.git
cd ur-manga-web
node dev.mjs
```

打开 `http://localhost:8000`。此服务同时提供 `dist/` 页面和 `/api/cover` 封面接口，与 Vercel 使用同一套封面处理代码。端口被占用时，先在原来的服务终端按 `Ctrl+C` 停止旧服务，再运行以上命令。切换后强制刷新网页，已保存的在线封面会自动重试。

可用 `PORT=8001 node dev.mjs` 更换端口。`python -m http.server` 只能预览静态页面，不能运行封面接口，因此不适合验证在线封面的 PNG 导出。也可用 `npx vercel dev` 验证 Vercel 部署环境。

## Vercel 部署

项目包含静态页面与一个 Vercel 封面函数，无需构建和 API 密钥。仓库根目录的 `vercel.json` 已指定发布 `dist/`，并跳过安装依赖与构建；根目录的 `api/cover.mjs` 自动部署为 `/api/cover`。仅上传 `dist/` 到静态托管不会提供此接口。

导入 GitHub 仓库时，Root Directory 保持仓库根目录（留空或 `./`），Framework Preset 选择 `Other`。将配置提交并推送到 Vercel 关联的分支后，部署最新提交。如果修改了 Vercel 项目设置，需要重新部署才能生效。

首页文件位于 `dist/index.html`；发布仓库根目录而未指定 `dist/`，可能导致首页返回 404。

## 使用

1. 点击长篇、中篇、短篇或同人选择格。
2. 搜索作品，或手动输入书名、作者 / 社团并上传封面。
3. 可填写推荐理由，在“署名与介绍”中编辑卡片文字。
4. 展开预览，下载 1200 × 1600 PNG。

手机上使用双列选择卡片、底部下载按钮和底部选择面板。输入框使用 16px 字号，避免 iOS 聚焦放大；适配安全区，预览与署名默认折叠。

## 界面样式

页面在 [DESIGN.md](./DESIGN.md) 的基础上按 taste v1 调整层级、间距和交互，使用白底、炭黑文字与玫粉点缀。选择卡片与搜索结果使用 20px 圆角，封面区域 12px、输入框 14px，预览面板与弹窗 28px；按钮保留胶囊形。桌面端标题、编辑区与预览左右排列，手机端保留双列卡片和底部下载栏。支持按压反馈、键盘聚焦、搜索骨架屏与减少动态效果设置。样式变量集中在 `dist/style.css` 的 `:root`，Canvas 推荐卡配色在 `dist/poster.mjs` 的 `POSTER_PALETTE`。

导出的 1200 × 1600 推荐图按新参考图使用四条横栏，依次展示长篇、中篇、短篇、同人。封面按左、右、左、右交替并轻微倾斜，另一侧放粉色分类圆章；中间使用大号衬线书名、浅粉作者胶囊与推荐理由，左右栏文字同步镜像对齐。四栏与底部署名共享粉色圆角外框和细分隔线。介绍文字在底部作为标题显示，未填写时显示“太好看了⑧”。长书名、作者与推荐语自动换行或截断，封面完整缩放，不裁切；缺少可导出封面时使用书名生成文字封面。

推荐图优先使用系统宋体 / 楷体，没有对应字体时回退到衬线字体；不同设备的字体外观可能略有差异。

页面优先使用本机已安装的 Satoshi 或 M Saans，否则回退到系统无衬线字体；无需远程字体请求。桌面端采用左右编辑与预览布局，手机端保留双列卡片、折叠预览及底部下载栏。

## Bangumi 搜索

直接调用 `POST https://api.bgm.tv/v0/search/subjects?limit=24&offset=0`，无需配置 API 密钥。用户输入仅去除首尾空白，完整作为 `keyword` 传给 Bangumi：

```json
{
  "keyword": "百合 雪子",
  "sort": "match",
  "filter": { "type": [1], "nsfw": false }
}
```

模糊匹配与相关度排序由 Bangumi 处理，页面按接口返回顺序展示，仅转换书名、作者和封面等显示字段。前端不解析作者或题材，也不做二次匹配、排序或跨来源合并。

输入停顿 700ms 后自动查询，支持中文输入法与单字搜索；新查询取消旧请求。同一关键词缓存 5 分钟，每次请求前 24 条。书籍类型筛选可能包含漫画以外的书籍，选择时请核对作品；未收录的漫画和同人可手动添加。

## 数据与隐私

搜索关键词仅发送给 Bangumi。上传封面在浏览器中缩放，支持 JPG、PNG、WebP，最大 8 MB；上传图片和选择仅保存于当前浏览器。清除网站数据会删除本地收藏卡。

搜索选中的封面保留原始地址供页面显示，导出时优先经同源 `/api/cover?url=…` 获取图片，避免跨域读取限制。服务端仅获取 `https://lain.bgm.tv/` 下的封面路径，拒绝重定向，限制 JPG、PNG、WebP、4 MB 和 8 秒超时，成功响应可缓存。传给该接口的只有封面地址，不包含上传图片、推荐语或署名。

成功读取后，前端保存缩放后的本地副本供 PNG 导出。刷新页面和下载时会重试先前未成功导入的封面；读取失败或纯静态环境中，会尝试直接读取原图，仍失败时提示导出将使用文字封面。可直接上传或替换封面。原始图片也无法加载时显示失败提示。

实时预览在选择作品、替换封面或编辑推荐语时立即更新，未保存的修改仅用于预览，关闭面板会恢复已保存内容。预览优先显示本地副本，也可直接显示在线封面；PNG 使用独立 Canvas，仅绘制成功导入或上传的图片，避免预览中的跨域图片阻止下载。

旧版本已保存的条目如果没有封面地址，需要重新搜索选择一次，或直接上传封面。

## 目录与检查

- `dist/`：可直接托管的 HTML、CSS、原生 JavaScript 与 Canvas 图片生成。
- `dist/poster.mjs`：参考图样式的 Canvas 推荐图绘制与文字排版。
- `dist/search.mjs`：Bangumi 条目搜索请求、返回字段转换、缓存与取消处理。
- `api/cover.mjs`：Vercel 同源封面接口，仅允许 Bangumi 封面，不提供任意地址代理。
- `dev.mjs`：本地页面与封面接口服务，无第三方依赖。
- `tests/`：保存恢复、封面处理、Bangumi 请求契约与异常处理测试，使用模拟响应，不依赖网络。
- `.github/workflows/check.yml`：推送及 PR 自动运行语法检查和测试。

```bash
node --test tests/*.test.mjs
node --check dist/app.mjs
node --check dist/model.mjs
node --check dist/search.mjs
node --check dist/cover.mjs
node --check api/cover.mjs
node --check dev.mjs
node --check dist/poster.mjs
```

推荐 Node.js 22。JavaScript 使用两个空格缩进。测试不能替代移动浏览器实测；正式发布前应检查搜索、上传、恢复、PNG 下载及 iOS / Android 键盘布局。需要凭证的新服务应通过后端代理访问，不应把密钥写入前端。

API 文档：[Bangumi OpenAPI](https://github.com/bangumi/server/blob/master/openapi/v0.yaml)。
