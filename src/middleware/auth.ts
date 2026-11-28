import type { Request, Response, NextFunction } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { sessions, users } from '../db/schema.ts';
import { hashSessionToken } from '../lib/password.ts';
import type { UserRole } from '../shared/types.ts';

export interface DbAdminUser {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthRequest extends Request {
  dbUser?: DbAdminUser;
  sessionToken?: string;
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  return parseCookie(req.headers.cookie, 'hg_session');
}

export const requireAdminSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const tokenHash = hashSessionToken(token);
    const rows = await db
      .select({
        user: users,
        sessionId: sessions.id,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0) {
      res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
      return;
    }

    const u = rows[0].user;
    if (!u.isActive) {
      res.status(403).json({
        error: 'This admin account is deactivated. Contact a Super Admin.',
      });
      return;
    }

    req.sessionToken = token;
    req.dbUser = {
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      role: u.role as UserRole,
      avatarUrl: u.avatarUrl ?? null,
      mustChangePassword: u.mustChangePassword,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };

    next();
  } catch (error) {
    console.error('Session verification failed:', error);
    res.status(500).json({ error: 'Failed to verify admin session.' });
  }
};

export const requirePasswordChanged = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.dbUser?.mustChangePassword) {
    res.status(403).json({
      error: 'Please change the initial demo password before managing the portal.',
      mustChangePassword: true,
    });
    return;
  }
  next();
};

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser || req.dbUser.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: Super Admin privileges required.' });
    return;
  }
  next();
};
