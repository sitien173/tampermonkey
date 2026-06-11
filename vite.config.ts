import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bundlePlugin = () => {
  return {
    name: 'bundle-plugin',
    enforce: 'post' as const,
    generateBundle(options, bundle) {
      const jsFile = Object.values(bundle).find(f => f.type === 'chunk' && f.isEntry);
      const cssFile = Object.values(bundle).find(f => f.type === 'asset' && f.fileName.endsWith('.css'));

      if (jsFile && jsFile.type === 'chunk') {
        let header = '';
        try {
          header = readFileSync(path.resolve(__dirname, 'src/userscript-header.js'), 'utf-8');
        } catch (e) {
          console.warn('Metadata header file not found, skipping prepend.');
        }

        let cssCode = '';
        if (cssFile && cssFile.type === 'asset') {
          cssCode = cssFile.source.toString();
          delete bundle[cssFile.fileName];
        }

        const cssInjection = `\nwindow.__CU_CSS__ = ${JSON.stringify(cssCode)};\n`;
        jsFile.code = header + '\n' + cssInjection + '\n' + jsFile.code;

        // Emit the metadata file for update checks (required by @updateURL)
        if (header) {
          this.emitFile({
            type: 'asset',
            fileName: 'cookie-updater.meta.js',
            source: header
          });
        }
      }
    }
  };
};

const copyToWwwroot = () => ({
  name: 'copy-to-wwwroot',
  closeBundle() {
    const destDir = path.resolve(__dirname, '../wwwroot');
    
    // Skip copy if target wwwroot directory does not exist (e.g., in CI or other environments)
    if (!existsSync(destDir)) {
      console.log(`Destination directory ${destDir} does not exist, skipping copy to wwwroot.`);
      return;
    }

    const filesToCopy = [
      {
        src: path.resolve(__dirname, 'dist/cookie-updater.user.js'),
        dest: path.resolve(destDir, 'cookie-updater.user.js'),
      },
      {
        src: path.resolve(__dirname, 'dist/cookie-updater.meta.js'),
        dest: path.resolve(destDir, 'cookie-updater.meta.js'),
      }
    ];

    for (const { src, dest } of filesToCopy) {
      try {
        if (existsSync(src)) {
          const content = readFileSync(src);
          writeFileSync(dest, content);
          console.log(`Copied ${src} to ${dest}`);
        } else {
          console.warn(`Source file ${src} not found, skipping copy.`);
        }
      } catch (err) {
        console.error(`Failed to copy ${path.basename(src)} to wwwroot: ${err.message}`);
      }
    }
  }
});

export default defineConfig(({ mode }) => ({
  root: './',
  base: './',
  plugins: [
    react(),
    bundlePlugin(),
    copyToWwwroot()
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'CookieUpdater',
      formats: ['iife'],
      fileName: () => 'cookie-updater.user.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
}));
