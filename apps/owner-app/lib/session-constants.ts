/**
 * Constants shared between Node-runtime (server components, route handlers)
 * and Edge-runtime (middleware) session code. Keeps the middleware import
 * graph free of `node:crypto`.
 */
export const SESSION_COOKIE_NAME = 'arp_session';
