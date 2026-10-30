import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The view is one module, `views/meeting-notes.js`, which the platform inlines
// into the document it frames the view in. That document maps the MCP Apps
// SDK to the platform's own copy and loads the kit's style sheet and icon
// font, so the build leaves the SDK as an import and bundles the rest,
// its own styles included.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'views',
    emptyOutDir: false,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: 'src/view/index.tsx',
      external: ['@modelcontextprotocol/ext-apps'],
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'meeting-notes.js',
      },
    },
  },
});
