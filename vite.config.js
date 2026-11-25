import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const crazy = env.VITE_PORTAL === 'crazygames';
  return {
    base: './',
    server: { host: true },
    preview: { host: true },
    build: {
      // WebGL2 baseline: Android Chrome 80+, iOS Safari 15+
      target: ['es2020', 'chrome80', 'safari15', 'firefox78'],
      chunkSizeWarningLimit: 2500,
    },
    plugins: [{
      // the CrazyGames build loads their SDK first thing in <head> (their docs ask for it there)
      name: 'portal-sdk',
      transformIndexHtml(html) {
        if (!crazy) return html;
        return html.replace('<head>', '<head>\n  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>');
      },
    }],
  };
});
