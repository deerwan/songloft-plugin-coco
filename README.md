# COCO音乐下载器 - Songloft 插件

基于 [Coco Downloader](https://github.com/markcxx/coco-downloader) 的音乐搜索、播放和下载 Songloft 插件。

## 功能

- 搜索多源音乐（网易云、QQ、酷狗、咪咕等）
- 在线播放音乐
- 下载音乐
- 连接自建的 Coco Downloader 服务

## 前置条件

你需要先部署 [Coco Downloader](https://github.com/markcxx/coco-downloader) 服务，并确保可以正常访问。

## 安装

### 方法一：开发模式（推荐开发使用）

```bash
cd songloft-plugin-coco
npm install
npm run dev
```

首次运行会交互式询问 Songloft 实例地址、用户名和密码。

### 方法二：构建后上传

```bash
cd songloft-plugin-coco
npm install
npm run build
```

在 Songloft 客户端的插件管理页选择 `dist/coco-downloader.jsplugin.zip` 上传安装。

### 方法三：目录放置

将 `dist/coco-downloader.jsplugin.zip` 放入服务器的 `data/jsplugins/` 目录，下次启动时自动扫描。

## 使用方法

1. 安装并启用插件后，在 Songloft 插件管理中找到 **COCO音乐下载器**
2. 点击插件进入，首先会看到配置页面
3. 填写你部署的 Coco Server 地址（如 `http://your-server:3000`）
4. 保存配置后即可使用完整的音乐搜索、播放、下载功能



## 权限

本插件仅需要 `storage` 权限，用于保存用户的 Coco Server 配置。

## 开发

```bash
# 安装依赖
npm install

# 开发模式（自动构建 + 上传 + 热重载）
npm run dev

# 构建生产包
npm run build

# 验证插件
npm run validate
```
