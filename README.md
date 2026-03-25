# Hacker News 精选推送


这个目录现在已经整理成“单独可部署仓库”形态：

- `.github/workflows/hn-digest.yml` 以当前目录作为仓库根目录运行
- 本地与 CI 配置都不再要求依赖外层 monorepo 结构
- Bark 收件人可直接使用仓库内的 `recipients.local.csv` 或 GitHub Secret `BARK_NAMED_KEYS`

## 当前约定

- 运行时：Node.js 20+
- 语言：TypeScript
- 翻译优先级：OpenAI 兼容接口 -> Google Translate 兜底
- 推送对象：当前仅 `liyu`
- Bark 图标：默认使用 Hacker News logo
- 页面形态：静态 HTML + CSS + 少量原生 JavaScript

## 目录结构

- `src/fetch/`：榜单抓取、HN API、外链正文提取
- `src/translate/`：翻译保护、Provider、缓存复用
- `src/render/`：首页、详情页、批次页、静态资源输出
- `src/notify/`：Bark 推送与去重
- `src/publish/`：状态文件读写
- `src/shared/`：共享类型、配置、时间与文件工具
- `state/`：翻译缓存、推送历史、批次索引
- `dist/`：站点产物
- `recipients.example.csv`：Bark 收件人样例

## 作为独立仓库使用

推荐把当前目录直接作为一个新仓库的根目录推到 GitHub，而不是继续依赖 `d:\\vscode` 外层仓库。

最简单的方式：

1. 在 GitHub 新建空仓库，例如 `hn-digest`
2. 把当前目录单独拷贝出去，或直接在当前目录初始化独立 git 仓库
3. 推送到你自己的 GitHub 仓库

示例命令：

```bash
git init
git add .
git commit -m "init hn digest"
git branch -M main
git remote add origin https://github.com/<your-name>/hn-digest.git
git push -u origin main
```

如果你仍然把它放在外层大仓库里开发，也没问题；只是 GitHub 上真正部署时，建议让“这个目录本身”成为仓库根目录。

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 检查 `.env`

- `OPENAI_API_KEY` 已放入本地 `.env`
- `OPENAI_BASE_URL` 当前指向你提供的兼容地址
- `SITE_BASE_URL` 目前仍是占位值，真正部署前请改成 GitHub Pages 实际地址
- 本地 Bark 推荐二选一：
  - 在仓库根目录放一个 `recipients.local.csv`
  - 或直接填写 `BARK_NAMED_KEYS=liyu:你的key`

本地收件人 CSV 格式可参考 [recipients.example.csv](d:\vscode\Hacker News精选推送\recipients.example.csv)。

3. 执行一次完整流程

```bash
npm run sync
```

4. 仅构建页面

```bash
npm run build
```

5. 单独推送 Bark

```bash
npm run notify
```

6. 运行测试

```bash
npm run test
```

## GitHub Actions / Pages

工作流文件位于 `.github/workflows/hn-digest.yml`，按北京时间 `08:00 / 12:00 / 15:00` 对应的 UTC cron 运行。

推荐在仓库中配置以下变量或 secret：

- `OPENAI_API_KEY`：必填 secret
- `OPENAI_BASE_URL`：推荐 repo variable，默认可填你当前使用的兼容地址
- `OPENAI_MODEL`：推荐 repo variable，默认 `gpt-5.3`
- `BARK_NAMED_KEYS`：必填 secret，格式建议 `liyu:xxxxx`
- `SITE_BASE_URL`：推荐 repo variable；如果不填，代码会尝试按 `https://<owner>.github.io/<repo>/` 推导
- `BARK_SERVER` / `BARK_ICON_URL`：可选 repo variable

首次部署建议：

1. 打开 GitHub 仓库 `Settings -> Pages`
2. 把 `Source` 设为 `GitHub Actions`
3. 在 `Settings -> Secrets and variables -> Actions` 中填好上面的 secret 和 variable
4. 首次手动运行一次 `hn-digest` workflow
5. 将 `SITE_BASE_URL` 设为 `https://<your-name>.github.io/<repo>/`

## 当前状态

这个项目已经可以作为独立仓库直接部署。已完成：

- 抓取 HN 榜单、详情、评论树和外链摘要
- OpenAI 兼容翻译与 Google 兜底
- 移动端优先的静态页面渲染
- Bark 推送与同批次去重
- GitHub Actions + Pages 发布工作流
