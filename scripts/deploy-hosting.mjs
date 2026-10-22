// Deploys this repo's static site to Firebase Hosting through the Hosting
// REST API, with a service account and no Firebase CLI.
//
//   FIREBASE_SERVICE_ACCOUNT=<service account JSON, or the same base64-encoded> \
//     node scripts/deploy-hosting.mjs
//
// `--dry-run` lists what would go up and stops there (no credentials needed).
//
// The site, the folder to publish, what to leave out and the headers come
// from firebase.json (hosting.site, hosting.public, hosting.ignore,
// hosting.headers), the project from .firebaserc. The CLI
// (`npx firebase-tools deploy`) reads the same files, but first asks the
// Service Usage API whether Hosting is enabled, which the project's admin SDK
// service account may not do; this script only needs Hosting itself.
// Needs Node 18 or newer (global fetch).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const hosting = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8')).hosting;
const project = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8')).projects.default;
const API = 'https://firebasehosting.googleapis.com/v1beta1/';

function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) {
    throw new Error('Set FIREBASE_SERVICE_ACCOUNT to the service account JSON (or base64 of it).');
  }
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
}

// An OAuth access token for the service account (a signed JWT exchanged at Google).
async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error('Token request failed: ' + JSON.stringify(data));
  }
  return data.access_token;
}

// A firebase.json glob (*, **) as a regular expression over paths like /a/b.js.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') {
      // **/ : any folders, or none
      re += '(?:.*/)?';
      i += 2;
    } else if (ch === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (ch === '*') {
      re += '[^/]*';
    } else {
      re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^/?' + re + '$');
}

// Every file to publish, by its site path, gzipped and hashed as Hosting wants.
function collectFiles(dir) {
  const ignore = (hosting.ignore || []).map(globToRegExp);
  const files = {};
  const blobs = {};
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const rel = '/' + path.relative(dir, full).split(path.sep).join('/');
      const folder = fs.statSync(full).isDirectory();
      // a folder is left out whole when its path or anything in it matches
      const tested = folder ? [rel, rel + '/', rel + '/\0'] : [rel];
      if (tested.some((p) => ignore.some((re) => re.test(p)))) {
        continue;
      }
      if (folder) {
        walk(full);
        continue;
      }
      const gz = zlib.gzipSync(fs.readFileSync(full), { level: 9 });
      const hash = crypto.createHash('sha256').update(gz).digest('hex');
      files[rel] = hash;
      blobs[hash] = gz;
    }
  };
  walk(dir);
  return { files, blobs };
}

async function main() {
  const site = hosting.site || project;
  const dir = path.resolve(root, hosting.public || '.');
  if (process.argv.includes('--dry-run')) {
    const { files } = collectFiles(dir);
    console.log(Object.keys(files).sort().join('\n'));
    console.log(`${Object.keys(files).length} files from ${path.relative(root, dir) || '.'} would go to ${site} (${project})`);
    return;
  }
  const token = await accessToken(serviceAccount());
  const call = async (url, method = 'GET', body) => {
    const res = await fetch(url.startsWith('http') ? url : API + url, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(method + ' ' + url + ' failed: ' + res.status + ' ' + JSON.stringify(data));
    }
    return data;
  };
  const config = {
    headers: (hosting.headers || []).map((h) => ({
      glob: h.source,
      headers: Object.fromEntries(h.headers.map((kv) => [kv.key, kv.value]))
    }))
  };
  const { files, blobs } = collectFiles(dir);
  if (!files['/index.html']) {
    // never release a site without its page (an empty build, a bad ignore)
    throw new Error(`No index.html among the ${Object.keys(files).length} files in ${dir}: nothing deployed.`);
  }
  const version = await call(`sites/${site}/versions`, 'POST', { config });
  console.log(`Deploying ${Object.keys(files).length} files from ${path.relative(root, dir) || '.'} to ${site} (${project})`);
  const populated = await call(`${version.name}:populateFiles`, 'POST', { files });
  const needed = populated.uploadRequiredHashes || [];
  for (const hash of needed) {
    const res = await fetch(`${populated.uploadUrl}/${hash}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
      body: blobs[hash]
    });
    if (!res.ok) {
      throw new Error('Upload failed: ' + res.status + ' ' + (await res.text()));
    }
  }
  console.log(`Uploaded ${needed.length} new files`);
  await call(`${version.name}?update_mask=status`, 'PATCH', { status: 'FINALIZED' });
  const release = await call(`sites/${site}/releases?versionName=${encodeURIComponent(version.name)}`, 'POST', {});
  console.log(`Released ${release.version.name} at ${release.releaseTime}: https://${site}.web.app`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
