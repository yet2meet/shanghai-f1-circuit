import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：发布到 GitHub Pages 的子路径（/shanghai-f1-circuit/）也能正常加载
  base: './',
  // main.js 用了顶层 await 来分步搭建场景
  build: { target: 'esnext', chunkSizeWarningLimit: 1500 },
  server: { host: true }, // 允许同一局域网内的手机访问，方便真机测试
});
