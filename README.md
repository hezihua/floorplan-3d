# 户型装修设计

基于 Next.js App Router 的户型装修设计工具。支持 2D 平面布置、家具与墙体编辑、尺寸测量、Three.js 3D 鸟瞰与漫游、材料估算，以及方案本地保存和 JSON 导入导出。

## 开发

需要 Node.js 20.9 或更高版本。

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址。生产构建和启动：

```bash
pnpm build
pnpm start
```

## 用户文档

- [使用说明](docs/使用说明.md)：启动、2D 编辑、3D 漫游、保存、导入导出和快捷键。

## 项目结构

- `app/page.tsx`：应用首页路由
- `app/Editor.tsx`：客户端编辑器入口，在浏览器挂载后加载编辑器运行时
- `app/editor-markup.ts`：编辑器页面结构
- `app/editor-runtime.js`：2D 编辑器与 Three.js 3D 场景逻辑
- `app/globals.css`：应用样式
- `docs/使用说明.md`：用户操作指南

户型、材料与家具数据和方案存储仍由编辑器运行时管理；方案默认保存在浏览器本地。
