import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

// In development the game runs on Vite and the score endpoints are proxied
// to the Express backend (npm start, port 8080).
const backend = 'http://localhost:' + (process.env.BACKEND_PORT || 8080);

// Every file under `dir`, as paths relative to it with forward slashes.
function filesIn(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      out.push(...filesIn(dir, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

// Offline play: once a build is written, src/sw.js goes into it as sw.js with
// the build's files (all of them: the page, the bundle, the sound worker, the
// models, the font, the icons) and a version made from their contents, so a
// change anywhere makes a new version. Dotfiles are left out, as Firebase
// Hosting does (firebase.json), since a file the worker cannot fetch would
// stop it from installing.
function offlinePlugin() {
  let root = process.cwd();
  return {
    name: 'etow3d-offline',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    writeBundle(options) {
      const outDir = options.dir || resolve(root, 'dist');
      const files = filesIn(outDir)
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.split('/').some((part) => part.startsWith('.')))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(outDir, f)));
      }
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync(resolve(root, 'src/sw.js'), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__FILES__', JSON.stringify(files.map((f) => '/' + f), null, 2));
      writeFileSync(join(outDir, 'sw.js'), source);
    }
  };
}

export default defineConfig({
  plugins: [offlinePlugin()],
  server: {
    proxy: {
      '/gamestates': backend,
      '/auth': backend,
      '/api': backend,
      '/health': backend
    }
  },
  build: {
    // the game is one bundle (three.js, the game and its synthesised sound
    // effects' recipes); the sounds themselves render in a worker chunk
    chunkSizeWarningLimit: 1300
  }
});
