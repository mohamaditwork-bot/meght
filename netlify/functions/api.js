// Netlify serverless entry — wraps the Express app so /api/* runs on Netlify.
import serverless from 'serverless-http';
import app from '../../app.js';

export const handler = serverless(app, { binary: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'multipart/form-data'] });
