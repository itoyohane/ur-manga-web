# 漫画私藏 · ur-manga-web

选择最喜欢的长篇、中篇、短篇和同人漫画，生成个人推荐卡。每类最多一部，可留空；篇幅由用户自行归类。

源代码仓库：https://github.com/itoyohane/ur-manga-web

## 本地运行

无需安装依赖或构建。克隆仓库后运行：

```bash
git clone https://github.com/itoyohane/ur-manga-web.git
cd ur-manga-web
python -m http.server 8000 --directory dist
```

打开 `http://localhost:8000`。使用 HTTP 访问，避免直接打开 HTML 导致模块加载受限。静态托管目录为 `dist/`。

## Vercel 部署

项目是无需构建的静态网站。仓库根目录的 `vercel.json` 已指定发布 `dist/`，并跳过安装依赖与构建。

导入 GitHub 仓库时，Root Directory 保持仓库根目录（留空或 `./`），Framework Preset 选择 `Other`。将配置提交并推送到 Vercel 关联的分支后，部署最新提交。如果修改了 Vercel 项目设置，需要重新部署才能生效。

首页文件位于 `dist/index.html`；发布仓库根目录而未指定 `dist/`，可能导致首页返回 404。

## 使用

1. 点击长篇、中篇、短篇或同人选择格。
2. 搜索作品，或手动输入书名、作者 / 社团并上传封面。
3. 可填写推荐理由，在“署名与介绍”中编辑卡片文字。
4. 展开预览，下载 1200 × 1500 PNG。

手机上使用双列选择卡片、底部下载按钮和底部选择面板。输入框使用 16px 字号，避免 iOS 聚焦放大；适配安全区，预览与署名默认折叠。

## 界面样式

页面基于 [DESIGN.md](./DESIGN.md) 中的 Mobbin Minimal 设计，使用白底、深色文字与少量玫粉点缀：标题、编号、选中状态和下载按钮使用粉色，保留大字号标题、轻边框卡片、胶囊按钮与浅灰输入框。样式变量集中在 `dist/style.css` 的 `:root`，Canvas 推荐卡配色在 `dist/app.mjs` 的 `palette`。

导出的 1200 × 1500 推荐图按用户草图使用四条横栏，依次展示长篇、中篇、短篇、同人。竖版封面按左、右、左、右交替，另一侧放分类、书名、作者和推荐理由；左右栏文字同步镜像对齐。四栏共享外框，使用浅粉分隔线，顶部保留精简署名和介绍。长书名、作者与推荐语自动换行或截断，封面完整缩放，不裁切。

仓库未包含 M Saans 字体文件，优先使用本机已安装的同名字体，否则回退到系统无衬线字体；无需远程字体请求。桌面端采用左右编辑与预览布局，手机端保留双列卡片、折叠预览及底部下载栏。

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

搜索关键词仅发送给 Bangumi。上传封面在浏览器中缩放，支持 JPG、PNG、WebP，最大 8 MB；封面和选择仅保存于当前浏览器，不上传服务器。在线封面由浏览器从图片源加载。清除网站数据会删除本地收藏卡。

搜索选中的封面保留原始地址，供编辑区与选择卡片显示；能成功读取的图片会另存为本地副本，用于 Canvas 预览与 PNG 导出。图片源未开放跨域读取时，页面仍尝试显示在线封面，并提示导出将使用文字封面。可在已选漫画的编辑区直接上传或替换封面，无需重新输入作品信息。原始图片也无法加载时显示失败提示。

旧版本已保存的条目如果没有封面地址，需要重新搜索选择一次，或直接上传封面。

## 目录与检查

- `dist/`：可直接托管的 HTML、CSS、原生 JavaScript 与 Canvas 图片生成。
- `dist/search.mjs`：Bangumi 条目搜索请求、返回字段转换、缓存与取消处理。
- `tests/`：保存恢复、封面处理、Bangumi 请求契约与异常处理测试，使用模拟响应，不依赖网络。
- `.github/workflows/check.yml`：推送及 PR 自动运行语法检查和测试。

```bash
node --test tests/*.test.mjs
node --check dist/app.mjs
node --check dist/model.mjs
node --check dist/search.mjs
node --check dist/cover.mjs
```

推荐 Node.js 22。JavaScript 使用两个空格缩进。测试不能替代移动浏览器实测；正式发布前应检查搜索、上传、恢复、PNG 下载及 iOS / Android 键盘布局。需要凭证的新服务应通过后端代理访问，不应把密钥写入前端。

API 文档：[Bangumi OpenAPI](https://github.com/bangumi/server/blob/master/openapi/v0.yaml)。
