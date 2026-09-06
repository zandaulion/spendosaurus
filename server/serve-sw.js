// Version stamping for apps that serve their own web directory.
//
// The static apps substitute __BUILD_VERSION__ at deploy time, with a hash of
// the files. The ones served from inside a container image have no deploy step
// to hook, so they do it here instead: the hash is computed once at boot and
// patched into sw.js on the way out.
//
// Either way the version comes from the content. A hand-bumped constant is the
// thing that eventually gets forgotten, and forgetting it does not fail
// loudly -- it just means nobody's app updates.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * A short, stable hash of everything in a directory.
 *
 * Contents rather than mtimes: a rebuild that changes no files should not
 * invalidate every client's cache, and a file restored from a backup with an
 * old timestamp should still count as a change.
 */
export function hashDirectory(dir) {
  const hash = crypto.createHash('sha256');
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        hash.update(entry.name);
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(dir);
  return hash.digest('hex').slice(0, 12);
}

/**
 * Express middleware serving sw.js with its version stamped in.
 *
 * Mount before express.static, or the unstamped file wins.
 *
 *     app.use(swVersion(path.join(__dirname, '../web')));
 *     app.use(express.static(...));
 */
export function swVersion(webDir, { file = 'sw.js' } = {}) {
  const source = fs.readFileSync(path.join(webDir, file), 'utf8');
  const version = hashDirectory(webDir);
  const body = source.replace(/__BUILD_VERSION__/g, version);

  return (req, res, next) => {
    if (req.path !== `/${file}`) return next();
    res.set('Content-Type', 'text/javascript; charset=utf-8');
    // The worker is the version signal, so it must never be answered from the
    // HTTP cache -- a stale sw.js pins an app to an old build for as long as
    // its cache headers allow.
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(body);
  };
}

/**
 * The same stamping for the shell.
 *
 * An app served out of a container image has no deploy step to substitute
 * __BUILD_VERSION__, so index.html's asset URLs stayed literal and every build
 * shipped the same /app.css?v=... address -- which is the whole problem the
 * hash exists to solve. Mount before express.static, and cover "/" as well as
 * the filename, since static resolves the directory index itself.
 */
export function shellVersion(webDir, { file = 'index.html' } = {}) {
  const source = fs.readFileSync(path.join(webDir, file), 'utf8');
  const version = hashDirectory(webDir);
  const body = source.replace(/__BUILD_VERSION__/g, version);
  const paths = new Set(['/', `/${file}`]);

  const send = (res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    // Revalidate every time: the shell is what points at the hashed assets.
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.send(body);
  };

  const middleware = (req, res, next) => (paths.has(req.path) ? send(res) : next());
  // Exposed so the SPA fallback answers with the same stamped body rather than
  // sending the raw file, which would put __BUILD_VERSION__ on the page for
  // every deep link.
  middleware.send = send;
  return middleware;
}
