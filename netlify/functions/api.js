// Netlify serverless entry — wraps the Express app so /api/* runs on Netlify.
import serverless from 'serverless-http';
import app from '../../app.js';

const wrapped = serverless(app, {
  binary: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'multipart/form-data'],
});

// Netlify delivers the request to the function under its base path
// (e.g. "/.netlify/functions/api/login"), NOT the original "/api/login".
// Express has no route for that prefix, so login (and every /api call) 404s —
// which the client surfaces as a false "wrong passcode". Normalize the path so
// Express always sees "/api/...", regardless of how Netlify formats it.
function normalizePath(p) {
  if (typeof p !== 'string') return p;
  let out = p.replace(/^\/\.netlify\/functions\/[^/]+/, ''); // strip function base
  if (!out) out = '/';
  if (!out.startsWith('/api')) out = '/api' + (out === '/' ? '' : out);
  return out;
}

export const handler = async (event, context) => {
  if (event) {
    if (typeof event.path === 'string') event.path = normalizePath(event.path);
    if (typeof event.rawPath === 'string') event.rawPath = normalizePath(event.rawPath);
    if (event.requestContext && event.requestContext.http && typeof event.requestContext.http.path === 'string') {
      event.requestContext.http.path = normalizePath(event.requestContext.http.path);
    }
  }
  return wrapped(event, context);
};
