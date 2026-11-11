import { defineConfig } from 'vite';

/** 在 HTML 头部预加载主程序和 three.js：页面一打开就开始下载，不必等启动页脚本执行完再发请求 */
function preloadMain() {
  return {
    name: 'preload-main',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const files = Object.values(ctx.bundle)
          .filter((c) => c.type === 'chunk' && (c.name === 'three' || (c.isDynamicEntry && c.facadeModuleId?.endsWith('main.js'))))
          .map((c) => c.fileName);
        const links = files.map((f) => `    <link rel="modulepreload" crossorigin href="./${f}">\n`).join('');
        return html.replace('</head>', `${links}  </head>`);
      },
    },
  };
}

/** 作者署名写进自己代码的文件头（在压缩之后添加，不会被去掉；three.js 为第三方 MIT 库，不加） */
function signature() {
  const text = '/*! © 2026 yet2meet. All rights reserved. Unauthorized copying, modification or deployment is prohibited. */\n';
  return {
    name: 'signature',
    enforce: 'post',
    apply: 'build',
    generateBundle: {
      order: 'post', // 排在 Vite 自己改写入口文件之后
      handler(_, bundle) {
        for (const f of Object.values(bundle)) {
          if (f.type === 'chunk' && f.name !== 'three') f.code = text + f.code;
          else if (f.type === 'asset' && f.fileName.endsWith('.css')) f.source = text + f.source;
        }
      },
    },
  };
}

export default defineConfig({
  // 相对路径：发布到 GitHub Pages 的子路径（/shanghai-f1-circuit/）也能正常加载
  base: './',
  plugins: [preloadMain(), signature()],
  build: {
    // main.js 用了顶层 await 来分步搭建场景
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // three.js 单独成块：项目更新后它的文件名不变，回访时可直接用浏览器缓存
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: { host: true }, // 允许同一局域网内的手机访问，方便真机测试
});
