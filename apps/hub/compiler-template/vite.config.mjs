export default {
  // The compiler sandbox writes the application to /workspace/app. The agent's sandbox already
  // holds it inside its checkout, so that flow points this at the checkout instead of copying.
  root: process.env.CONEXUS_COMPILE_ROOT ?? '/workspace/app',
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
