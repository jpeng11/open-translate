import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Open Translate',
    description: 'Bilingual web translation with your own AI model',
    permissions: ['storage', 'activeTab'],
    // Required to reach whatever endpoint the user configures (incl. localhost Ollama).
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
