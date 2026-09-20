export default {
  root: '/workspace/app',
  base: '/',
  publicDir: false,
  cacheDir: '/workspace/.vite',
  envDir: '/opt/conexus/compiler',
  envPrefix: 'CONEXUS_PUBLIC_',
  css: { postcss: { plugins: [] } },
  build: {
    outDir: '/workspace/dist',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
  },
}
