import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { asc, desc, eq, or } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  categories,
  departments,
  importHistory,
  planChangeLogs,
  pricingHistory,
  sessions,
  settings,
  users,
} from './src/db/schema.ts';
import {
  DEMO_ADMIN_PASSWORD,
  ensureDefaultCategories,
  ensureDemoAdminSeeded,
  getOrInitSettings,
  slugifyCategory,
} from './src/db/defaults.ts';
import {
  createPlanRecord,
  deletePlanRecord,
  deletePlansBulk,
  fetchAllPlans,
  fetchPlanById,
  togglePlanStatus,
  updatePlanRecord,
  type UpsertPlanInput,
} from './src/db/plans.ts';
import {
  commitExcelImport,
  generateImportPreview,
  inspectWorkbookBuffer,
} from './src/db/excel.ts';
import {
  LeadAccessDeniedError,
  addLeadRemarkRecord,
  bulkImportLeadRecords,
  createLeadRecord,
  deleteLeadRecord,
  deleteLeadsBulk,
  fetchActiveLeadReminders,
  fetchLeadAccessLogs,
  fetchLeadById,
  fetchLeadColleagues,
  fetchScopedLeads,
  getOrEnsureAiSensyWebhookSecret,
  ingestAiSensyWebhookLead,
  lockColleagueLeads,
  rotateAiSensyWebhookSecret,
  setUserLeadSecurityCode,
  transferLeadsBySuperAdmin,
  unlockColleagueLeads,
  updateLeadRecord,
  updateLeadReminderAction,
} from './src/db/leads.ts';
import {
  createCommunicationTemplate,
  createDepartmentRecord,
  createKnowledgebaseArticle,
  deleteCommunicationTemplate,
  deleteDepartmentRecord,
  deleteKnowledgebaseArticle,
  deleteTeamTargetRecord,
  fetchCombinedDashboard,
  fetchCommunicationTemplates,
  fetchDepartments,
  fetchKnowledgebaseArticles,
  fetchKnowledgebaseImageById,
  fetchReportsAnalytics,
  fetchTeamTargets,
  saveKnowledgebaseImage,
  updateCommunicationTemplate,
  updateDepartmentRecord,
  updateKnowledgebaseArticle,
  upsertTeamTargetRecord,
} from './src/db/portalModules.ts';
import {
  extractSessionToken,
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './src/lib/password.ts';
import type {
  BillingCycle,
  ColumnMappingEntry,
  ImportMode,
  ImportPreviewRow,
  LeadInterventionScope,
  UserRole,
} from './src/shared/types.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

interface StagedUpload {
  buffer: Buffer;
  filename: string;
  userId: string;
  createdAt: number;
}
const stagedUploads = new Map<string, StagedUpload>();

function pruneStagedUploads() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [token, entry] of stagedUploads.entries()) {
    if (entry.createdAt < cutoff) {
      stagedUploads.delete(token);
    }
  }
}

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error('Invalid file type. Only .xlsx, .xls, and .csv files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_LOGO_EXTENSIONS = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);
const ALLOWED_LOGO_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_LOGO_EXTENSIONS.has(ext) && !ALLOWED_LOGO_MIMES.has(mime)) {
      cb(new Error('Invalid logo format. Upload PNG, JPG, WEBP, or SVG (max 2 MB).'));
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_KB_IMAGE_EXTENSIONS = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);
const ALLOWED_KB_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const kbImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_KB_IMAGE_EXTENSIONS.has(ext) && !ALLOWED_KB_IMAGE_MIMES.has(mime)) {
      cb(new Error('Invalid image format. Upload PNG, JPG, WEBP, or GIF (max 3 MB).'));
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_AVATAR_EXTENSIONS = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);
const ALLOWED_AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_AVATAR_EXTENSIONS.has(ext) && !ALLOWED_AVATAR_MIMES.has(mime)) {
      cb(new Error('Invalid image format. Upload PNG, JPG, or WEBP (max 2 MB).'));
      return;
    }
    cb(null, true);
  },
});

function validateLogoUrl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.length > 3_000_000) {
    throw new Error('Logo image data is too large. Keep uploads under 2 MB.');
  }

  if (trimmed.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,[A-Za-z0-9+/=]+$/i.exec(
      trimmed
    );
    if (!match) {
      throw new Error('Invalid image data URI. Use PNG, JPG, WEBP, or SVG.');
    }
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    if (/\s/.test(trimmed)) {
      throw new Error('Logo path must not contain spaces.');
    }
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Logo URL must use https:// or http://.');
    }
    return parsed.toString();
  } catch {
    throw new Error('Enter a valid image URL (https://...) or upload a logo file.');
  }
}

function setSessionCookie(res: Response, token: string) {
  res.cookie('hg_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function sanitizeUser(
  u: typeof users.$inferSelect,
  departmentNameMap?: Map<number, string>
) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    role: u.role as UserRole,
    departmentId: u.departmentId ?? null,
    departmentName:
      u.departmentId !== null && u.departmentId !== undefined
        ? departmentNameMap?.get(u.departmentId) ?? null
        : null,
    jobTitle: u.jobTitle ?? null,
    phone: u.phone ?? null,
    avatarUrl: u.avatarUrl ?? null,
    mustChangePassword: u.mustChangePassword,
    isActive: u.isActive,
    hasLeadSecurityCode: Boolean(u.leadSecurityCodeHash),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// =========================================================================
// PUBLIC INTERNAL EMPLOYEE PANEL ROUTES (NO LOGIN REQUIRED)
// =========================================================================

app.get('/api/public/context', async (_req, res) => {
  try {
    const [portalSettings, categoryList, demoInfo] = await Promise.all([
      getOrInitSettings(),
      ensureDefaultCategories(),
      ensureDemoAdminSeeded(),
    ]);
    res.json({
      settings: portalSettings,
      categories: categoryList,
      demoPasswordActive: demoInfo.demoPasswordActive,
    });
  } catch (error) {
    console.error('GET /api/public/context failed:', error);
    res.status(500).json({ error: 'Failed to load portal configuration.' });
  }
});

app.get('/api/public/plans', async (_req, res) => {
  try {
    const plans = await fetchAllPlans({ activeOnly: true });
    res.json(plans);
  } catch (error) {
    console.error('GET /api/public/plans failed:', error);
    res.status(500).json({ error: 'Failed to load hosting plans.' });
  }
});

app.get('/api/public/plans/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid plan ID.' });
      return;
    }
    const plan = await fetchPlanById(id);
    if (!plan || !plan.isActive) {
      res.status(404).json({ error: 'Hosting plan not found.' });
      return;
    }
    res.json(plan);
  } catch (error) {
    console.error('GET /api/public/plans/:id failed:', error);
    res.status(500).json({ error: 'Failed to load hosting plan.' });
  }
});

// =========================================================================
// LOCAL ADMIN AUTHENTICATION ROUTES
// =========================================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    await ensureDemoAdminSeeded();

    const { identifier, password } = req.body as {
      identifier?: string;
      password?: string;
    };
    const cleanId = (identifier || '').trim().toLowerCase();
    if (!cleanId || !password) {
      res.status(400).json({ error: 'Username or email and password are required.' });
      return;
    }

    const found = await db
      .select()
      .from(users)
      .where(or(eq(users.email, cleanId), eq(users.username, cleanId)))
      .limit(1);

    if (found.length === 0) {
      res.status(401).json({ error: 'Invalid username/email or password.' });
      return;
    }

    const userRow = found[0];
    if (!userRow.isActive) {
      res.status(403).json({
        error: 'This admin account is deactivated. Contact a Super Admin.',
      });
      return;
    }

    const valid = verifyPassword(password, userRow.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username/email or password.' });
      return;
    }

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      tokenHash,
      userId: userRow.id,
      expiresAt,
    });

    setSessionCookie(res, rawToken);
    res.json({
      token: rawToken,
      user: sanitizeUser(userRow),
    });
  } catch (error) {
    console.error('POST /api/auth/login failed:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (token) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
    }
  } catch (error) {
    console.error('POST /api/auth/logout warning:', error);
  }
  res.clearCookie('hg_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (!token) {
      res.json({ user: null });
      return;
    }

    const { gt, and } = await import('drizzle-orm');
    const tokenHash = hashSessionToken(token);
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (rows.length === 0 || !rows[0].user.isActive) {
      res.json({ user: null });
      return;
    }

    const [portalSettings, categoryList, deptRows] = await Promise.all([
      getOrInitSettings(),
      ensureDefaultCategories(),
      db.select().from(departments),
    ]);
    const deptMap = new Map<number, string>();
    for (const d of deptRows) deptMap.set(d.id, d.name);

    res.json({
      user: sanitizeUser(rows[0].user, deptMap),
      settings: portalSettings,
      categories: categoryList,
    });
  } catch (error) {
    console.error('GET /api/auth/session failed:', error);
    res.json({ user: null });
  }
});

app.get('/api/auth/me', requireAdminSession, async (req: AuthRequest, res) => {
  try {
    const [portalSettings, categoryList] = await Promise.all([
      getOrInitSettings(),
      ensureDefaultCategories(),
    ]);
    res.json({
      user: req.dbUser,
      settings: portalSettings,
      categories: categoryList,
    });
  } catch (error) {
    console.error('GET /api/auth/me failed:', error);
    res.status(500).json({ error: 'Failed to load admin session.' });
  }
});

app.post('/api/auth/change-password', requireAdminSession, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        error: 'New password must be at least 8 characters long.',
      });
      return;
    }

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, req.dbUser!.id))
      .limit(1);

    if (userRows.length === 0) {
      res.status(404).json({ error: 'Admin user not found.' });
      return;
    }

    const userRow = userRows[0];
    if (!verifyPassword(currentPassword, userRow.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    if (userRow.mustChangePassword && newPassword === DEMO_ADMIN_PASSWORD) {
      res.status(400).json({
        error: 'Please choose a new password different from the default demo password.',
      });
      return;
    }

    const updated = await db
      .update(users)
      .set({
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userRow.id))
      .returning();

    res.json({ user: sanitizeUser(updated[0]) });
  } catch (error) {
    console.error('POST /api/auth/change-password failed:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

app.post(
  '/api/profile/avatar',
  requireAdminSession,
  requirePasswordChanged,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Invalid profile picture upload (PNG, JPG, or WEBP up to 2 MB).';
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please select an image file to upload.' });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const rawMime = (req.file.mimetype || '').toLowerCase();
      const mimeType = ALLOWED_AVATAR_MIMES.has(rawMime)
        ? rawMime
        : ALLOWED_AVATAR_EXTENSIONS.get(ext) || 'image/png';

      const dataUrl = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;

      const updated = await db
        .update(users)
        .set({
          avatarUrl: dataUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      const deptRows = await db.select().from(departments);
      const deptMap = new Map<number, string>();
      for (const d of deptRows) deptMap.set(d.id, d.name);

      res.json({ user: sanitizeUser(updated[0], deptMap) });
    } catch (error) {
      console.error('POST /api/profile/avatar failed:', error);
      res.status(500).json({ error: 'Failed to upload profile picture.' });
    }
  }
);

app.delete(
  '/api/profile/avatar',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res: Response) => {
    try {
      const updated = await db
        .update(users)
        .set({
          avatarUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      const deptRows = await db.select().from(departments);
      const deptMap = new Map<number, string>();
      for (const d of deptRows) deptMap.set(d.id, d.name);

      res.json({ user: sanitizeUser(updated[0], deptMap) });
    } catch (error) {
      console.error('DELETE /api/profile/avatar failed:', error);
      res.status(500).json({ error: 'Failed to remove profile picture.' });
    }
  }
);

// =========================================================================
// PROTECTED ADMIN PANEL ROUTES
// =========================================================================

app.put(
  '/api/settings',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const current = await getOrInitSettings();
      const {
        companyName,
        companyWebsite,
        currencyCode,
        currencySymbol,
        defaultTaxRate,
        defaultTaxDisplay,
        defaultBillingDurations,
      } = req.body as Partial<{
        companyName: string;
        companyWebsite: string;
        currencyCode: string;
        currencySymbol: string;
        defaultTaxRate: number;
        defaultTaxDisplay: 'before_tax' | 'inclusive_of_tax';
        defaultBillingDurations: BillingCycle[];
      }>;

      const cleanTaxRate = Number(defaultTaxRate ?? current.defaultTaxRate);
      if (Number.isNaN(cleanTaxRate) || cleanTaxRate < 0 || cleanTaxRate > 100) {
        res.status(400).json({ error: 'Tax rate must be between 0 and 100.' });
        return;
      }

      await db
        .update(settings)
        .set({
          companyName: (companyName || current.companyName).trim(),
          companyWebsite: (companyWebsite || current.companyWebsite).trim(),
          currencyCode: (currencyCode || current.currencyCode).trim().toUpperCase(),
          currencySymbol: (currencySymbol || current.currencySymbol).trim(),
          defaultTaxRate: cleanTaxRate,
          defaultTaxDisplay:
            defaultTaxDisplay === 'inclusive_of_tax' ? 'inclusive_of_tax' : 'before_tax',
          defaultBillingDurations:
            Array.isArray(defaultBillingDurations) && defaultBillingDurations.length > 0
              ? defaultBillingDurations
              : current.defaultBillingDurations,
          updatedBy: req.dbUser?.email || null,
          updatedAt: new Date(),
        })
        .where(eq(settings.id, current.id));

      const refreshed = await getOrInitSettings();
      res.json(refreshed);
    } catch (error) {
      console.error('PUT /api/settings failed:', error);
      res.status(500).json({ error: 'Failed to save settings.' });
    }
  }
);

// Logo Management
app.get('/api/public/logo-asset', async (req, res) => {
  try {
    const target = req.query.target === 'pdf' ? 'pdf' : 'brand';
    const current = await getOrInitSettings();
    const rawUrl =
      target === 'pdf' ? current.pdfLogoUrl || current.logoUrl : current.logoUrl;

    if (!rawUrl) {
      res.status(404).end();
      return;
    }

    if (rawUrl.startsWith('data:')) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(
        rawUrl
      );
      if (!match) {
        res.status(400).end();
        return;
      }
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
      return;
    }

    if (rawUrl.startsWith('/')) {
      const publicRoot = path.resolve(import.meta.dirname, 'public');
      const resolved = path.resolve(publicRoot, `.${rawUrl}`);
      if (!resolved.startsWith(publicRoot) || !fs.existsSync(resolved)) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(resolved);
      return;
    }

    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      res.status(400).end();
      return;
    }

    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      res.status(502).end();
      return;
    }
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.status(400).end();
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 2.5 * 1024 * 1024) {
      res.status(413).end();
      return;
    }
    res.setHeader('Content-Type', contentType.split(';')[0]);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (error) {
    console.error('GET /api/public/logo-asset failed:', error);
    res.status(500).end();
  }
});

app.post(
  '/api/admin/logo/upload',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  logoUpload.single('logo'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please select a logo image file to upload.' });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const rawMime = (req.file.mimetype || '').toLowerCase();
      const mimeType = ALLOWED_LOGO_MIMES.has(rawMime)
        ? rawMime
        : ALLOWED_LOGO_EXTENSIONS.get(ext) || 'image/png';

      const dataUrl = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;
      const current = await getOrInitSettings();
      const bodyObj = req.body as {
        target?: string;
        logoShowCompanyName?: string | boolean;
      };
      const target = bodyObj?.target === 'pdf' ? 'pdf' : 'brand';

      if (target === 'pdf') {
        await db
          .update(settings)
          .set({
            pdfLogoUrl: dataUrl,
            updatedBy: req.dbUser?.email || null,
            updatedAt: new Date(),
          })
          .where(eq(settings.id, current.id));
      } else {
        const showCompanyNameRaw = bodyObj?.logoShowCompanyName;
        const showCompanyName =
          showCompanyNameRaw === undefined
            ? current.logoShowCompanyName
            : showCompanyNameRaw === true || showCompanyNameRaw === 'true';

        await db
          .update(settings)
          .set({
            logoUrl: dataUrl,
            logoShowCompanyName: showCompanyName,
            updatedBy: req.dbUser?.email || null,
            updatedAt: new Date(),
          })
          .where(eq(settings.id, current.id));
      }

      const refreshed = await getOrInitSettings();
      res.json(refreshed);
    } catch (error) {
      console.error('POST /api/admin/logo/upload failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to upload logo.',
      });
    }
  }
);

app.put(
  '/api/admin/logo',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const current = await getOrInitSettings();
      const body = req.body as {
        target?: 'brand' | 'pdf';
        logoUrl?: string | null;
        pdfLogoUrl?: string | null;
        logoShowCompanyName?: boolean;
      };

      const nextLogoUrl =
        body.logoUrl !== undefined ? validateLogoUrl(body.logoUrl) : current.logoUrl;
      const nextPdfLogoUrl =
        body.pdfLogoUrl !== undefined
          ? validateLogoUrl(body.pdfLogoUrl)
          : current.pdfLogoUrl;
      const nextShowName =
        typeof body.logoShowCompanyName === 'boolean'
          ? body.logoShowCompanyName
          : current.logoShowCompanyName;

      await db
        .update(settings)
        .set({
          logoUrl: nextLogoUrl,
          pdfLogoUrl: nextPdfLogoUrl,
          logoShowCompanyName: nextShowName,
          updatedBy: req.dbUser?.email || null,
          updatedAt: new Date(),
        })
        .where(eq(settings.id, current.id));

      const refreshed = await getOrInitSettings();
      res.json(refreshed);
    } catch (error) {
      console.error('PUT /api/admin/logo failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to save logo settings.',
      });
    }
  }
);

app.delete(
  '/api/admin/logo',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const current = await getOrInitSettings();
      const target =
        req.query.target === 'pdf' ||
        (req.body as { target?: string } | undefined)?.target === 'pdf'
          ? 'pdf'
          : 'brand';

      if (target === 'pdf') {
        await db
          .update(settings)
          .set({
            pdfLogoUrl: null,
            updatedBy: req.dbUser?.email || null,
            updatedAt: new Date(),
          })
          .where(eq(settings.id, current.id));
      } else {
        await db
          .update(settings)
          .set({
            logoUrl: null,
            logoShowCompanyName: true,
            updatedBy: req.dbUser?.email || null,
            updatedAt: new Date(),
          })
          .where(eq(settings.id, current.id));
      }

      const refreshed = await getOrInitSettings();
      res.json(refreshed);
    } catch (error) {
      console.error('DELETE /api/admin/logo failed:', error);
      res.status(500).json({ error: 'Failed to reset logo.' });
    }
  }
);

// Categories
app.post(
  '/api/categories',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const { name, description, sortOrder } = req.body as {
        name?: string;
        description?: string;
        sortOrder?: number;
      };
      const cleanName = (name || '').trim();
      if (!cleanName) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }
      const slug = slugifyCategory(cleanName);
      const existing = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: 'A category with this name already exists.' });
        return;
      }
      const inserted = await db
        .insert(categories)
        .values({
          name: cleanName,
          slug,
          description: description?.trim() || null,
          sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 50,
        })
        .returning();

      res.status(201).json(inserted[0]);
    } catch (error) {
      console.error('POST /api/categories failed:', error);
      res.status(500).json({ error: 'Failed to create category.' });
    }
  }
);

app.delete(
  '/api/categories/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid category ID.' });
        return;
      }
      await db.delete(categories).where(eq(categories.id, id));
      res.json({ deleted: true });
    } catch (error) {
      console.error('DELETE /api/categories/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete category.' });
    }
  }
);

// Admin Plans Management
app.get(
  '/api/admin/plans',
  requireAdminSession,
  requirePasswordChanged,
  async (_req, res) => {
    try {
      const plans = await fetchAllPlans({ activeOnly: false });
      res.json(plans);
    } catch (error) {
      console.error('GET /api/admin/plans failed:', error);
      res.status(500).json({ error: 'Failed to load hosting plans.' });
    }
  }
);

app.post(
  '/api/plans',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as UpsertPlanInput;
      if (!body?.name?.trim() || !body?.categoryName?.trim()) {
        res.status(400).json({ error: 'Plan Name and Category are required.' });
        return;
      }
      const created = await createPlanRecord(
        body,
        req.dbUser?.email || 'admin',
        null
      );
      res.status(201).json(created);
    } catch (error) {
      console.error('POST /api/plans failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to create plan.',
      });
    }
  }
);

app.put(
  '/api/plans/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid plan ID.' });
        return;
      }
      const body = req.body as UpsertPlanInput;
      if (!body?.name?.trim() || !body?.categoryName?.trim()) {
        res.status(400).json({ error: 'Plan Name and Category are required.' });
        return;
      }
      const updated = await updatePlanRecord(
        id,
        body,
        req.dbUser?.email || 'admin',
        null
      );
      res.json(updated);
    } catch (error) {
      console.error('PUT /api/plans/:id failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update plan.',
      });
    }
  }
);

app.patch(
  '/api/plans/:id/status',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid plan ID.' });
        return;
      }
      const { isActive } = req.body as { isActive?: boolean };
      if (typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'isActive boolean is required.' });
        return;
      }
      const updated = await togglePlanStatus(
        id,
        isActive,
        req.dbUser?.email || 'admin'
      );
      res.json(updated);
    } catch (error) {
      console.error('PATCH /api/plans/:id/status failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to update status.',
      });
    }
  }
);

app.delete(
  '/api/plans/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid plan ID.' });
        return;
      }
      await deletePlanRecord(id, req.dbUser?.email || 'admin');
      res.json({ deleted: true });
    } catch (error) {
      console.error('DELETE /api/plans/:id failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to delete plan.',
      });
    }
  }
);

app.post(
  '/api/plans/bulk-delete',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const rawIds = (req.body as { planIds?: unknown })?.planIds;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        res.status(400).json({ error: 'Select at least one plan to delete.' });
        return;
      }

      const uniqueIds = Array.from(
        new Set(
          rawIds
            .map((value) => Number(value))
            .filter((id) => Number.isInteger(id) && id > 0)
        )
      );

      if (uniqueIds.length === 0) {
        res.status(400).json({ error: 'No valid plan IDs provided.' });
        return;
      }

      if (uniqueIds.length > 500) {
        res
          .status(400)
          .json({ error: 'Cannot delete more than 500 plans in a single request.' });
        return;
      }

      const result = await deletePlansBulk(
        uniqueIds,
        req.dbUser?.email || 'admin'
      );

      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'No matching hosting plans found.' });
        return;
      }

      res.json(result);
    } catch (error) {
      console.error('POST /api/plans/bulk-delete failed:', error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete selected plans.',
      });
    }
  }
);

// Combined Executive Dashboard
app.get(
  '/api/dashboard',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const data = await fetchCombinedDashboard({
        viewerUserId: access.viewerUserId,
        viewerName: access.viewerName,
        isSuperAdmin: req.dbUser!.role === 'super_admin',
        sessionTokenHash: access.sessionTokenHash,
      });
      res.json(data);
    } catch (error) {
      console.error('GET /api/dashboard failed:', error);
      res.status(500).json({ error: 'Failed to load dashboard summary.' });
    }
  }
);

// Excel Upload, Column Mapping, Preview & Import
app.get(
  '/api/excel/template',
  requireAdminSession,
  requirePasswordChanged,
  (_req, res) => {
    const wb = XLSX.utils.book_new();

    const dedicatedSheet = XLSX.utils.json_to_sheet([
      {
        'Plan Name': 'Starter Server',
        'Plan Name ': 'Starter Core',
        'Short Description': 'Enterprise bare-metal server with dedicated IP pool',
        Processor: 'Intel® Xeon® Processor',
        'vCPU Cores': '20 Cores / 40 Threads',
        'RAM (GB)': '128 GB',
        'NVMe SSD (TB)': '2 TB NVMe',
        'Bandwidth (TB)': 'Unlimited',
        'IP Address': '32 Dedicated IP',
        'Base Monthly Price': 1969,
        Monthly: 1969,
        Quarterly: 1900,
        'Semi-Annually': 1850,
        Annually: 1799,
        Biennially: 1699,
        Triennially: 1599,
        'Monthly WHMCS Feed': 1969,
        'Quarterly WHMCS Feed': 5700,
        'Semi-Annually WHMCS Feed': 11100,
        'Annually WHMCS Feed': 21588,
        'Biennially WHMCS Feed': 40776,
        'Triennially WHMCS Feed': 57564,
        'Special Offers':
          'Virtualizer License Free (Cost: ₹1,500); 8 IPs Free (Cost: ₹2,400); Unlimited Bandwidth (Free, Value: ₹5,000)',
      },
    ]);

    const vpsSheet = XLSX.utils.json_to_sheet([
      {
        'Plan Name': 'Cloud VPS',
        'Plan Name ': 'NVMe Pro',
        'Short Description': 'High-frequency KVM VPS for production workloads',
        vCPU: '4 vCPU Cores',
        'RAM (GB)': '8 GB DDR4',
        'Storage (GB)': '160 GB NVMe SSD',
        'Bandwidth (TB)': '4 TB',
        Virtualization: 'KVM',
        'Base Monthly Price': 999,
        Monthly: 999,
        Quarterly: 949,
        'Semi-Annually': 899,
        Annually: 832.5,
        Biennially: 749,
        Triennially: 699,
        'Monthly WHMCS Feed': 999,
        'Quarterly WHMCS Feed': 2847,
        'Semi-Annually WHMCS Feed': 5394,
        'Annually WHMCS Feed': 9990,
        'Biennially WHMCS Feed': 17976,
        'Triennially WHMCS Feed': 25164,
        'Free Add-ons': 'Free Snapshot Backups; Free Setup',
      },
    ]);

    XLSX.utils.book_append_sheet(wb, dedicatedSheet, 'Dedicated Server');
    XLSX.utils.book_append_sheet(wb, vpsSheet, 'VPS Hosting');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="hostgraber-pricing-template.xlsx"'
    );
    res.send(buf);
  }
);

app.post(
  '/api/excel/inspect',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please select an Excel or CSV file to upload.' });
        return;
      }

      pruneStagedUploads();
      const parsed = inspectWorkbookBuffer(req.file.buffer);
      if (parsed.worksheets.length === 0) {
        res.status(400).json({
          error: 'No readable worksheets or header columns were found in this file.',
        });
        return;
      }

      const uploadToken = crypto.randomUUID();
      stagedUploads.set(uploadToken, {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        userId: String(req.dbUser?.id || 'admin'),
        createdAt: Date.now(),
      });

      res.json({
        uploadToken,
        filename: req.file.originalname,
        fileSize: req.file.size,
        worksheets: parsed.worksheets,
        unrecognizedColumns: parsed.unrecognizedColumns,
      });
    } catch (error) {
      console.error('POST /api/excel/inspect failed:', error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to parse the uploaded spreadsheet.',
      });
    }
  }
);

app.post(
  '/api/excel/preview',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const {
        uploadToken,
        selectedSheets,
        sheetMappings,
        importMode,
        targetCategory,
      } = req.body as {
        uploadToken?: string;
        selectedSheets?: string[];
        sheetMappings?: Record<string, ColumnMappingEntry[]>;
        importMode?: ImportMode;
        targetCategory?: string | null;
      };

      if (!uploadToken) {
        res.status(400).json({ error: 'Missing upload token. Please re-upload the file.' });
        return;
      }

      const staged = stagedUploads.get(uploadToken);
      if (!staged) {
        res.status(404).json({
          error: 'Upload session expired. Please upload the spreadsheet again.',
        });
        return;
      }

      if (!Array.isArray(selectedSheets) || selectedSheets.length === 0) {
        res.status(400).json({ error: 'Select at least one worksheet to preview.' });
        return;
      }

      const preview = await generateImportPreview({
        buffer: staged.buffer,
        filename: staged.filename,
        selectedSheets,
        sheetMappings: sheetMappings || {},
        importMode: importMode || 'update_existing',
        targetCategory: targetCategory || null,
      });

      res.json(preview);
    } catch (error) {
      console.error('POST /api/excel/preview failed:', error);
      res.status(500).json({ error: 'Failed to generate import preview.' });
    }
  }
);

app.post(
  '/api/excel/commit',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    const {
      uploadToken,
      filename,
      worksheetNames,
      importMode,
      targetCategory,
      rows,
    } = req.body as {
      uploadToken?: string;
      filename?: string;
      worksheetNames?: string[];
      importMode?: ImportMode;
      targetCategory?: string | null;
      rows?: ImportPreviewRow[];
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'No rows provided for import.' });
      return;
    }

    const safeFilename = filename || 'uploaded-pricing.xlsx';
    const uploaderName = req.dbUser?.displayName || req.dbUser?.username || 'Admin';
    const uploaderEmail = req.dbUser?.email || 'admin';

    try {
      const result = await commitExcelImport({
        filename: safeFilename,
        worksheetNames: worksheetNames || [],
        importMode: importMode || 'update_existing',
        targetCategory: targetCategory || null,
        rows,
        uploadedBy: uploaderName,
        uploadedByEmail: uploaderEmail,
      });

      if (uploadToken) {
        stagedUploads.delete(uploadToken);
      }

      res.json(result);
    } catch (error) {
      console.error('POST /api/excel/commit failed:', error);
      const causeMessage =
        error instanceof Error &&
        error.cause &&
        typeof error.cause === 'object' &&
        'message' in error.cause
          ? String((error.cause as { message: unknown }).message)
          : '';
      const detailedError =
        error instanceof Error
          ? causeMessage && !error.message.includes(causeMessage)
            ? `${causeMessage} — ${error.message}`
            : error.message
          : 'Import transaction failed and was safely rolled back.';
      try {
        await db.insert(importHistory).values({
          originalFilename: safeFilename,
          uploadedBy: uploaderName,
          uploadedByEmail: uploaderEmail,
          worksheetNames: worksheetNames || [],
          importMode: importMode || 'update_existing',
          totalPlansDetected: rows.length,
          newPlansImported: 0,
          existingPlansUpdated: 0,
          status: 'failed',
          errorInfo: detailedError,
          summaryData: null,
        });
      } catch (logErr) {
        console.error('Failed to record failed import history:', logErr);
      }
      res.status(500).json({
        error: detailedError,
      });
    }
  }
);

// Import History, Pricing History & Change Logs
app.get(
  '/api/imports',
  requireAdminSession,
  requirePasswordChanged,
  async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(importHistory)
        .orderBy(desc(importHistory.createdAt))
        .limit(100);
      res.json(rows);
    } catch (error) {
      console.error('GET /api/imports failed:', error);
      res.status(500).json({ error: 'Failed to load import history.' });
    }
  }
);

app.get(
  '/api/history/pricing',
  requireAdminSession,
  requirePasswordChanged,
  async (req, res) => {
    try {
      const planIdParam = req.query.planId ? Number(req.query.planId) : null;
      const rows =
        planIdParam && !Number.isNaN(planIdParam)
          ? await db
              .select()
              .from(pricingHistory)
              .where(eq(pricingHistory.planId, planIdParam))
              .orderBy(desc(pricingHistory.changedAt))
              .limit(200)
          : await db
              .select()
              .from(pricingHistory)
              .orderBy(desc(pricingHistory.changedAt))
              .limit(200);
      res.json(rows);
    } catch (error) {
      console.error('GET /api/history/pricing failed:', error);
      res.status(500).json({ error: 'Failed to load pricing history.' });
    }
  }
);

app.get(
  '/api/history/changes',
  requireAdminSession,
  requirePasswordChanged,
  async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(planChangeLogs)
        .orderBy(desc(planChangeLogs.changedAt))
        .limit(200);
      res.json(rows);
    } catch (error) {
      console.error('GET /api/history/changes failed:', error);
      res.status(500).json({ error: 'Failed to load plan change history.' });
    }
  }
);

// Admin User Management
app.get(
  '/api/users',
  requireAdminSession,
  requirePasswordChanged,
  async (_req, res) => {
    try {
      const [rows, deptRows] = await Promise.all([
        db.select().from(users).orderBy(asc(users.createdAt)),
        db.select().from(departments),
      ]);
      const deptMap = new Map<number, string>();
      for (const d of deptRows) deptMap.set(d.id, d.name);
      res.json(rows.map((u) => sanitizeUser(u, deptMap)));
    } catch (error) {
      console.error('GET /api/users failed:', error);
      res.status(500).json({ error: 'Failed to load admin users.' });
    }
  }
);

app.post(
  '/api/users',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const {
        username,
        email,
        displayName,
        password,
        role,
        departmentId,
        jobTitle,
        phone,
      } = req.body as {
        username?: string;
        email?: string;
        displayName?: string;
        password?: string;
        role?: UserRole;
        departmentId?: number | null;
        jobTitle?: string | null;
        phone?: string | null;
      };

      const cleanUsername = (username || '').trim().toLowerCase();
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanUsername || !/^[a-z0-9._-]{3,40}$/.test(cleanUsername)) {
        res.status(400).json({
          error: 'Username must be 3–40 characters (letters, numbers, ., _, -).',
        });
        return;
      }
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Valid email address is required.' });
        return;
      }
      if (!password || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' });
        return;
      }

      const validRole: UserRole = role === 'super_admin' ? 'super_admin' : 'admin';

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.email, cleanEmail), eq(users.username, cleanUsername)))
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({
          error: 'An admin user with that username or email already exists.',
        });
        return;
      }

      let resolvedDeptId: number | null = null;
      if (departmentId && Number.isInteger(Number(departmentId))) {
        const [deptRow] = await db
          .select({ id: departments.id })
          .from(departments)
          .where(eq(departments.id, Number(departmentId)))
          .limit(1);
        if (deptRow) resolvedDeptId = deptRow.id;
      }

      const inserted = await db
        .insert(users)
        .values({
          username: cleanUsername,
          email: cleanEmail,
          displayName: displayName?.trim() || cleanUsername,
          passwordHash: hashPassword(password),
          role: validRole,
          departmentId: resolvedDeptId,
          jobTitle: jobTitle?.trim() || null,
          phone: phone?.trim() || null,
          mustChangePassword: false,
          isActive: true,
        })
        .returning();

      const deptRows = await db.select().from(departments);
      const deptMap = new Map<number, string>();
      for (const d of deptRows) deptMap.set(d.id, d.name);

      res.status(201).json(sanitizeUser(inserted[0], deptMap));
    } catch (error) {
      console.error('POST /api/users failed:', error);
      res.status(500).json({ error: 'Failed to create admin user.' });
    }
  }
);

app.patch(
  '/api/users/:id/profile',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Valid user ID is required.' });
        return;
      }
      const { displayName, departmentId, jobTitle, phone } = req.body as {
        displayName?: string | null;
        departmentId?: number | null;
        jobTitle?: string | null;
        phone?: string | null;
      };

      let resolvedDeptId: number | null = null;
      if (departmentId !== null && departmentId !== undefined) {
        const parsedDept = Number(departmentId);
        if (Number.isInteger(parsedDept) && parsedDept > 0) {
          const [deptRow] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, parsedDept))
            .limit(1);
          if (deptRow) resolvedDeptId = deptRow.id;
        }
      }

      const updated = await db
        .update(users)
        .set({
          ...(displayName !== undefined
            ? { displayName: displayName?.trim() || null }
            : {}),
          ...(departmentId !== undefined ? { departmentId: resolvedDeptId } : {}),
          ...(jobTitle !== undefined ? { jobTitle: jobTitle?.trim() || null } : {}),
          ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      const deptRows = await db.select().from(departments);
      const deptMap = new Map<number, string>();
      for (const d of deptRows) deptMap.set(d.id, d.name);
      res.json(sanitizeUser(updated[0], deptMap));
    } catch (error) {
      console.error('PATCH /api/users/:id/profile failed:', error);
      res.status(500).json({ error: 'Failed to update team member profile.' });
    }
  }
);

app.patch(
  '/api/users/:id/password',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { newPassword } = req.body as { newPassword?: string };
      if (Number.isNaN(id) || !newPassword || newPassword.length < 8) {
        res.status(400).json({
          error: 'Valid user ID and password (min 8 chars) are required.',
        });
        return;
      }

      const updated = await db
        .update(users)
        .set({
          passwordHash: hashPassword(newPassword),
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'Admin user not found.' });
        return;
      }
      res.json(sanitizeUser(updated[0]));
    } catch (error) {
      console.error('PATCH /api/users/:id/password failed:', error);
      res.status(500).json({ error: 'Failed to reset user password.' });
    }
  }
);

app.patch(
  '/api/users/:id/role',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { role } = req.body as { role?: UserRole };
      if (Number.isNaN(id) || (role !== 'super_admin' && role !== 'admin')) {
        res.status(400).json({ error: 'Valid user ID and role are required.' });
        return;
      }

      if (req.dbUser?.id === id && role !== 'super_admin') {
        const superAdmins = await db
          .select()
          .from(users)
          .where(eq(users.role, 'super_admin'));
        if (superAdmins.length <= 1) {
          res.status(400).json({
            error: 'Cannot demote the only Super Admin account.',
          });
          return;
        }
      }

      const updated = await db
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json(sanitizeUser(updated[0]));
    } catch (error) {
      console.error('PATCH /api/users/:id/role failed:', error);
      res.status(500).json({ error: 'Failed to update user role.' });
    }
  }
);

app.patch(
  '/api/users/:id/status',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { isActive } = req.body as { isActive?: boolean };
      if (Number.isNaN(id) || typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'Valid user ID and isActive boolean required.' });
        return;
      }

      if (req.dbUser?.id === id && !isActive) {
        res.status(400).json({ error: 'You cannot deactivate your own account.' });
        return;
      }

      const updated = await db
        .update(users)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      if (updated.length === 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json(sanitizeUser(updated[0]));
    } catch (error) {
      console.error('PATCH /api/users/:id/status failed:', error);
      res.status(500).json({ error: 'Failed to update user status.' });
    }
  }
);

app.delete(
  '/api/users/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Valid user ID is required.' });
        return;
      }

      if (req.dbUser?.id === id) {
        res.status(400).json({ error: 'You cannot delete your own account.' });
        return;
      }

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!target) {
        res.status(404).json({ error: 'Admin user not found.' });
        return;
      }

      if (target.role === 'super_admin') {
        const superAdmins = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, 'super_admin'));
        if (superAdmins.length <= 1) {
          res.status(400).json({
            error: 'Cannot delete the only Super Admin account.',
          });
          return;
        }
      }

      await db.delete(users).where(eq(users.id, id));
      res.json({ deleted: true, id });
    } catch (error) {
      console.error('DELETE /api/users/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete user.' });
    }
  }
);

// =========================================================================
// LEAD MANAGE CRM, INTERVENTION SECURITY & WEBHOOK ROUTES
// =========================================================================

function resolveWebhookUrl(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    try {
      const parsed = new URL(envUrl);
      return `${parsed.origin}/api/webhooks/leads`;
    } catch {
      // fallback to request headers
    }
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    typeof protoHeader === 'string' && protoHeader.trim()
      ? protoHeader.split(',')[0].trim()
      : req.protocol || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}/api/webhooks/leads`;
}

function constantTimeSecretMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getLeadAccessContext(req: AuthRequest) {
  const viewerUserId = req.dbUser!.id;
  const viewerName = req.dbUser!.displayName || req.dbUser!.username;
  const sessionTokenHash = hashSessionToken(req.sessionToken || '');
  return { viewerUserId, viewerName, sessionTokenHash };
}

app.get(
  '/api/leads',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const rawScope = typeof req.query.scope === 'string' ? req.query.scope : 'me';
      const scope: LeadInterventionScope =
        rawScope === 'any' ||
        rawScope === 'other' ||
        rawScope === 'watched' ||
        rawScope === 'user'
          ? rawScope
          : 'me';
      const targetUserId = req.query.userId ? Number(req.query.userId) : null;
      const logSwitch = req.query.logSwitch === '1';

      const items = await fetchScopedLeads({
        scope,
        targetUserId:
          targetUserId && !Number.isNaN(targetUserId) ? targetUserId : null,
        viewerUserId: access.viewerUserId,
        viewerName: access.viewerName,
        isSuperAdmin: req.dbUser!.role === 'super_admin',
        sessionTokenHash: access.sessionTokenHash,
        logSwitch,
      });
      res.json(items);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({
          error: error.message,
          requiresUnlock: true,
          targetUserId: error.targetUserId,
        });
        return;
      }
      console.error('GET /api/leads failed:', error);
      res.status(500).json({ error: 'Failed to load leads.' });
    }
  }
);

app.get(
  '/api/leads/colleagues',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const result = await fetchLeadColleagues(
        access.viewerUserId,
        access.sessionTokenHash
      );
      res.json(result);
    } catch (error) {
      console.error('GET /api/leads/colleagues failed:', error);
      res.status(500).json({ error: 'Failed to load team members.' });
    }
  }
);

app.post(
  '/api/leads/security-code',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as { securityCode?: string };
      await setUserLeadSecurityCode(req.dbUser!.id, body.securityCode || '');
      res.json({ ok: true, hasLeadSecurityCode: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save security code.';
      res.status(400).json({ error: message });
    }
  }
);

app.post(
  '/api/leads/unlock',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const body = req.body as { targetUserId?: number; securityCode?: string };
      const targetUserId = Number(body.targetUserId);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        res.status(400).json({ error: 'Valid colleague user ID is required.' });
        return;
      }

      const result = await unlockColleagueLeads({
        sessionTokenHash: access.sessionTokenHash,
        viewerUserId: access.viewerUserId,
        viewerName: access.viewerName,
        targetUserId,
        securityCode: body.securityCode || '',
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to verify security code.';
      res.status(400).json({ error: message });
    }
  }
);

app.post(
  '/api/leads/lock',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const body = req.body as { targetUserId?: number };
      const targetUserId = Number(body.targetUserId);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        res.status(400).json({ error: 'Valid colleague user ID is required.' });
        return;
      }
      await lockColleagueLeads({
        sessionTokenHash: access.sessionTokenHash,
        viewerUserId: access.viewerUserId,
        targetUserId,
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('POST /api/leads/lock failed:', error);
      res.status(500).json({ error: 'Failed to lock colleague lead access.' });
    }
  }
);

app.get(
  '/api/leads/access-logs',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const logs = await fetchLeadAccessLogs({
        viewerUserId: req.dbUser!.id,
        isSuperAdmin: req.dbUser!.role === 'super_admin',
      });
      res.json(logs);
    } catch (error) {
      console.error('GET /api/leads/access-logs failed:', error);
      res.status(500).json({ error: 'Failed to load access logs.' });
    }
  }
);

app.get(
  '/api/leads/webhook-config',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const webhookSecret = await getOrEnsureAiSensyWebhookSecret();
      res.json({
        webhookUrl: resolveWebhookUrl(req),
        webhookSecret,
      });
    } catch (error) {
      console.error('GET /api/leads/webhook-config failed:', error);
      res.status(500).json({ error: 'Failed to load webhook configuration.' });
    }
  }
);

app.post(
  '/api/leads/webhook-config/rotate',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const actor = req.dbUser?.displayName || req.dbUser?.username || 'admin';
      const webhookSecret = await rotateAiSensyWebhookSecret(actor);
      res.json({
        webhookUrl: resolveWebhookUrl(req),
        webhookSecret,
      });
    } catch (error) {
      console.error('POST /api/leads/webhook-config/rotate failed:', error);
      res.status(500).json({ error: 'Failed to rotate webhook secret.' });
    }
  }
);

app.get(
  '/api/leads/reminders',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const items = await fetchActiveLeadReminders({
        viewerUserId: access.viewerUserId,
        sessionTokenHash: access.sessionTokenHash,
        isSuperAdmin: req.dbUser!.role === 'super_admin',
      });
      res.json(items);
    } catch (error) {
      console.error('GET /api/leads/reminders failed:', error);
      res.status(500).json({ error: 'Failed to load scheduled call reminders.' });
    }
  }
);

app.get(
  '/api/leads/:id',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid lead ID.' });
        return;
      }
      const access = getLeadAccessContext(req);
      const lead = await fetchLeadById(id, {
        viewerUserId: access.viewerUserId,
        sessionTokenHash: access.sessionTokenHash,
        isSuperAdmin: req.dbUser!.role === 'super_admin',
      });
      if (!lead) {
        res.status(404).json({ error: 'Lead not found.' });
        return;
      }
      res.json(lead);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({
          error: error.message,
          requiresUnlock: true,
          targetUserId: error.targetUserId,
        });
        return;
      }
      console.error('GET /api/leads/:id failed:', error);
      res.status(500).json({ error: 'Failed to load lead details.' });
    }
  }
);

app.post(
  '/api/leads',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const body = req.body as {
        leadCode?: string | null;
        ownerUserId?: number | null;
        name?: string;
        phone?: string;
        email?: string | null;
        leadType?: string | null;
        source?: string;
        campaignName?: string | null;
        status?: string;
        latestRemark?: string | null;
        leadDate?: string | null;
        followUpDate?: string | null;
        followUpTime?: string | null;
        dealValue?: number | null;
        watcherUserIds?: number[];
      };

      const created = await createLeadRecord(
        {
          leadCode: null,
          ownerUserId:
            body.ownerUserId && Number.isInteger(Number(body.ownerUserId))
              ? Number(body.ownerUserId)
              : access.viewerUserId,
          name: body.name || '',
          phone: body.phone || '',
          email: body.email ?? null,
          leadType: body.leadType ?? 'retail',
          source: body.source || 'other',
          campaignName: body.campaignName ?? null,
          status: body.status || 'new_lead',
          latestRemark: body.latestRemark ?? '',
          leadDate: body.leadDate ?? null,
          followUpDate: body.followUpDate ?? null,
          followUpTime: body.followUpTime ?? null,
          dealValue: body.dealValue ?? null,
          watcherUserIds: Array.isArray(body.watcherUserIds)
            ? body.watcherUserIds
            : [],
          actor: access.viewerName,
        },
        {
          ...access,
          isSuperAdmin: req.dbUser!.role === 'super_admin',
        }
      );
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('POST /api/leads failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to create lead.';
      res.status(400).json({ error: message });
    }
  }
);

app.put(
  '/api/leads/:id',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid lead ID.' });
        return;
      }
      const access = getLeadAccessContext(req);
      const body = req.body as {
        leadCode?: string | null;
        name?: string;
        phone?: string;
        email?: string | null;
        leadType?: string | null;
        source?: string;
        campaignName?: string | null;
        status?: string;
        latestRemark?: string | null;
        leadDate?: string | null;
        followUpDate?: string | null;
        followUpTime?: string | null;
        dealValue?: number | null;
        watcherUserIds?: number[];
      };

      const safeBody = { ...body };
      if (req.dbUser?.role !== 'super_admin') {
        delete safeBody.leadCode;
      }

      const updated = await updateLeadRecord(
        id,
        {
          ...safeBody,
          actor: access.viewerName,
        },
        {
          ...access,
          isSuperAdmin: req.dbUser!.role === 'super_admin',
        }
      );
      if (!updated) {
        res.status(404).json({ error: 'Lead not found.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('PUT /api/leads/:id failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to update lead.';
      res.status(400).json({ error: message });
    }
  }
);

app.post(
  '/api/leads/:id/remarks',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid lead ID.' });
        return;
      }
      const access = getLeadAccessContext(req);
      const body = req.body as {
        remark?: string;
        statusAtCall?: string;
        callDate?: string | null;
        followUpDate?: string | null;
        followUpTime?: string | null;
      };

      const updated = await addLeadRemarkRecord(
        id,
        {
          remark: body.remark || '',
          statusAtCall: body.statusAtCall || 'new_lead',
          callDate: body.callDate ?? null,
          followUpDate: body.followUpDate,
          followUpTime: body.followUpTime,
          actor: access.viewerName,
        },
        {
          ...access,
          isSuperAdmin: req.dbUser!.role === 'super_admin',
        }
      );
      if (!updated) {
        res.status(404).json({ error: 'Lead not found.' });
        return;
      }
      res.status(201).json(updated);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('POST /api/leads/:id/remarks failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to add call remark.';
      res.status(400).json({ error: message });
    }
  }
);

app.post(
  '/api/leads/:id/reminder',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid lead ID.' });
        return;
      }
      const access = getLeadAccessContext(req);
      const body = req.body as {
        action?: string;
        followUpDate?: string | null;
        followUpTime?: string | null;
      };

      if (body.action !== 'dismiss' && body.action !== 'snooze') {
        res.status(400).json({ error: 'Action must be dismiss or snooze.' });
        return;
      }

      const updated = await updateLeadReminderAction(
        id,
        {
          action: body.action,
          followUpDate: body.followUpDate ?? null,
          followUpTime: body.followUpTime ?? null,
        },
        {
          ...access,
          isSuperAdmin: req.dbUser!.role === 'super_admin',
        }
      );
      if (!updated) {
        res.status(404).json({ error: 'Lead not found.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('POST /api/leads/:id/reminder failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to update reminder.';
      res.status(400).json({ error: message });
    }
  }
);

app.post(
  '/api/leads/parse-import',
  requireAdminSession,
  requirePasswordChanged,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Upload a CSV or Excel file first.' });
        return;
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        res.status(400).json({ error: 'No worksheet found in the uploaded file.' });
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rawMatrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (rawMatrix.length === 0) {
        res.status(400).json({ error: 'The uploaded file is empty.' });
        return;
      }

      const headers = rawMatrix[0].map((cell) => String(cell ?? '').trim());
      const rows = rawMatrix.slice(1).map((row) => {
        const record: Record<string, string> = {};
        headers.forEach((header, idx) => {
          const key = header || `Column ${idx + 1}`;
          record[key] = String(row[idx] ?? '').trim();
        });
        return record;
      });

      res.json({ headers, rows });
    } catch (error) {
      console.error('POST /api/leads/parse-import failed:', error);
      res.status(400).json({ error: 'Unable to parse uploaded CSV/Excel file.' });
    }
  }
);

app.post(
  '/api/leads/import',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const body = req.body as {
        ownerUserId?: number | null;
        rows?: Array<{
          leadCode?: string;
          name?: string;
          phone?: string;
          email?: string;
          leadType?: string;
          remark?: string;
          status?: string;
          source?: string;
          leadDate?: string;
          followUpDate?: string;
          campaignName?: string;
        }>;
      };

      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        res.status(400).json({ error: 'Provide at least one lead row to import.' });
        return;
      }

      if (body.rows.length > 2000) {
        res.status(400).json({ error: 'Maximum 2,000 leads per import batch.' });
        return;
      }

      const targetOwnerId =
        body.ownerUserId && Number.isInteger(Number(body.ownerUserId))
          ? Number(body.ownerUserId)
          : access.viewerUserId;

      const result = await bulkImportLeadRecords(
        body.rows,
        access.viewerName,
        targetOwnerId,
        access
      );
      res.json(result);
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('POST /api/leads/import failed:', error);
      res.status(400).json({ error: 'Failed to import leads.' });
    }
  }
);

app.post(
  '/api/leads/transfer',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as {
        leadIds?: unknown;
        fromUserId?: unknown;
        targetUserId?: unknown;
        note?: string;
      };

      const targetUserId = Number(body.targetUserId);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        res.status(400).json({ error: 'Valid destination team member is required.' });
        return;
      }

      const leadIds = Array.isArray(body.leadIds)
        ? body.leadIds
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v > 0)
        : undefined;

      const fromUserId =
        body.fromUserId !== undefined && body.fromUserId !== null
          ? Number(body.fromUserId)
          : null;

      const actorName = req.dbUser!.displayName || req.dbUser!.username;
      const result = await transferLeadsBySuperAdmin({
        leadIds,
        fromUserId:
          fromUserId && Number.isInteger(fromUserId) && fromUserId > 0
            ? fromUserId
            : null,
        targetUserId,
        note: typeof body.note === 'string' ? body.note : null,
        actorUserId: req.dbUser!.id,
        actorName,
      });

      res.json({ ok: true, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to transfer leads.';
      res.status(400).json({ error: message });
    }
  }
);

app.post(
  '/api/leads/bulk-delete',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const access = getLeadAccessContext(req);
      const body = req.body as { ids?: unknown };
      if (!Array.isArray(body.ids)) {
        res.status(400).json({ error: 'ids array is required.' });
        return;
      }
      const ids = body.ids
        .map((val) => Number(val))
        .filter((val) => Number.isInteger(val) && val > 0);
      const deletedCount = await deleteLeadsBulk(ids, access);
      res.json({ deletedCount });
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('POST /api/leads/bulk-delete failed:', error);
      res.status(500).json({ error: 'Failed to delete selected leads.' });
    }
  }
);

app.delete(
  '/api/leads/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid lead ID.' });
        return;
      }
      const access = getLeadAccessContext(req);
      const deleted = await deleteLeadRecord(id, access);
      if (!deleted) {
        res.status(404).json({ error: 'Lead not found.' });
        return;
      }
      res.json({ deleted: true, id });
    } catch (error) {
      if (error instanceof LeadAccessDeniedError) {
        res.status(403).json({ error: error.message, requiresUnlock: true });
        return;
      }
      console.error('DELETE /api/leads/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete lead.' });
    }
  }
);

// =========================================================================
// KNOWLEDGEBASE ROUTES
// =========================================================================
app.get(
  '/api/knowledgebase',
  requireAdminSession,
  requirePasswordChanged,
  async (req, res) => {
    try {
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const items = await fetchKnowledgebaseArticles(category);
      res.json(items);
    } catch (error) {
      console.error('GET /api/knowledgebase failed:', error);
      res.status(500).json({ error: 'Failed to load knowledgebase articles.' });
    }
  }
);

app.get(
  '/api/knowledgebase/images/:id',
  requireAdminSession,
  requirePasswordChanged,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).end();
        return;
      }
      const img = await fetchKnowledgebaseImageById(id);
      if (!img) {
        res.status(404).end();
        return;
      }
      const safeMime = ALLOWED_KB_IMAGE_MIMES.has(img.mimeType)
        ? img.mimeType
        : 'image/png';
      const buffer = Buffer.from(img.dataBase64, 'base64');
      res.setHeader('Content-Type', safeMime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(buffer);
    } catch (error) {
      console.error('GET /api/knowledgebase/images/:id failed:', error);
      res.status(500).end();
    }
  }
);

app.post(
  '/api/knowledgebase/images',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  kbImageUpload.single('image'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please select an image file to upload.' });
        return;
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      const rawMime = (req.file.mimetype || '').toLowerCase();
      const mimeType = ALLOWED_KB_IMAGE_MIMES.has(rawMime)
        ? rawMime
        : ALLOWED_KB_IMAGE_EXTENSIONS.get(ext) || 'image/png';

      const actor = req.dbUser!.displayName || req.dbUser!.username;
      const saved = await saveKnowledgebaseImage({
        mimeType,
        filename: req.file.originalname,
        dataBase64: req.file.buffer.toString('base64'),
        actor,
      });
      res.status(201).json(saved);
    } catch (error) {
      console.error('POST /api/knowledgebase/images failed:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to upload image.',
      });
    }
  }
);

app.post(
  '/api/knowledgebase',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as {
        category?: string;
        title?: string;
        summary?: string | null;
        content?: string;
        tags?: string | null;
        isPinned?: boolean;
      };
      const actor = req.dbUser!.displayName || req.dbUser!.username;
      const created = await createKnowledgebaseArticle({
        category: body.category || 'product_documentation',
        title: body.title || '',
        summary: body.summary ?? null,
        content: body.content || '',
        tags: body.tags ?? null,
        isPinned: Boolean(body.isPinned),
        actor,
      });
      res.status(201).json(created);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create article.';
      res.status(400).json({ error: msg });
    }
  }
);

app.put(
  '/api/knowledgebase/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid article ID.' });
        return;
      }
      const body = req.body as {
        category?: string;
        title?: string;
        summary?: string | null;
        content?: string;
        tags?: string | null;
        isPinned?: boolean;
      };
      const actor = req.dbUser!.displayName || req.dbUser!.username;
      const updated = await updateKnowledgebaseArticle(id, {
        ...body,
        actor,
      });
      if (!updated) {
        res.status(404).json({ error: 'Article not found.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to update article.';
      res.status(400).json({ error: msg });
    }
  }
);

app.delete(
  '/api/knowledgebase/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid article ID.' });
        return;
      }
      const deleted = await deleteKnowledgebaseArticle(id);
      if (!deleted) {
        res.status(404).json({ error: 'Article not found.' });
        return;
      }
      res.json({ deleted: true, id });
    } catch (error) {
      console.error('DELETE /api/knowledgebase/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete article.' });
    }
  }
);

// =========================================================================
// COMMUNICATION CENTER ROUTES
// =========================================================================
app.get(
  '/api/communication-templates',
  requireAdminSession,
  requirePasswordChanged,
  async (req, res) => {
    try {
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const items = await fetchCommunicationTemplates(category);
      res.json(items);
    } catch (error) {
      console.error('GET /api/communication-templates failed:', error);
      res.status(500).json({ error: 'Failed to load communication templates.' });
    }
  }
);

app.post(
  '/api/communication-templates',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as {
        category?: string;
        title?: string;
        subject?: string | null;
        content?: string;
        tags?: string | null;
      };
      const actor = req.dbUser!.displayName || req.dbUser!.username;
      const created = await createCommunicationTemplate({
        category: body.category || 'whatsapp_templates',
        title: body.title || '',
        subject: body.subject ?? null,
        content: body.content || '',
        tags: body.tags ?? null,
        actor,
      });
      res.status(201).json(created);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create template.';
      res.status(400).json({ error: msg });
    }
  }
);

app.put(
  '/api/communication-templates/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid template ID.' });
        return;
      }
      const body = req.body as {
        category?: string;
        title?: string;
        subject?: string | null;
        content?: string;
        tags?: string | null;
      };
      const actor = req.dbUser!.displayName || req.dbUser!.username;
      const updated = await updateCommunicationTemplate(id, {
        ...body,
        actor,
      });
      if (!updated) {
        res.status(404).json({ error: 'Template not found.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to update template.';
      res.status(400).json({ error: msg });
    }
  }
);

app.delete(
  '/api/communication-templates/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid template ID.' });
        return;
      }
      const deleted = await deleteCommunicationTemplate(id);
      if (!deleted) {
        res.status(404).json({ error: 'Template not found.' });
        return;
      }
      res.json({ deleted: true, id });
    } catch (error) {
      console.error('DELETE /api/communication-templates/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete template.' });
    }
  }
);

// =========================================================================
// REPORTS & ANALYTICS ROUTES
// =========================================================================
app.get(
  '/api/reports',
  requireAdminSession,
  requirePasswordChanged,
  async (req: AuthRequest, res) => {
    try {
      const monthKey =
        typeof req.query.month === 'string' ? req.query.month : undefined;
      const report = await fetchReportsAnalytics({
        viewerUserId: req.dbUser!.id,
        isSuperAdmin: req.dbUser!.role === 'super_admin',
        monthKey,
      });
      res.json(report);
    } catch (error) {
      console.error('GET /api/reports failed:', error);
      res.status(500).json({ error: 'Failed to load reports & analytics.' });
    }
  }
);

// =========================================================================
// TEAM MANAGEMENT ROUTES (DEPARTMENTS & TARGETS — SUPER ADMIN)
// =========================================================================
app.get(
  '/api/team/departments',
  requireAdminSession,
  requirePasswordChanged,
  async (_req, res) => {
    try {
      const items = await fetchDepartments();
      res.json(items);
    } catch (error) {
      console.error('GET /api/team/departments failed:', error);
      res.status(500).json({ error: 'Failed to load departments.' });
    }
  }
);

app.post(
  '/api/team/departments',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        description?: string | null;
        leadName?: string | null;
      };
      const created = await createDepartmentRecord({
        name: body.name || '',
        description: body.description ?? null,
        leadName: body.leadName ?? null,
      });
      res.status(201).json(created);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create department.';
      res.status(400).json({ error: msg });
    }
  }
);

app.put(
  '/api/team/departments/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid department ID.' });
        return;
      }
      const body = req.body as {
        name?: string;
        description?: string | null;
        leadName?: string | null;
      };
      const updated = await updateDepartmentRecord(id, body);
      if (!updated) {
        res.status(404).json({ error: 'Department not found.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to update department.';
      res.status(400).json({ error: msg });
    }
  }
);

app.delete(
  '/api/team/departments/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid department ID.' });
        return;
      }
      const deleted = await deleteDepartmentRecord(id);
      if (!deleted) {
        res.status(404).json({ error: 'Department not found.' });
        return;
      }
      res.json({ deleted: true, id });
    } catch (error) {
      console.error('DELETE /api/team/departments/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete department.' });
    }
  }
);

app.get(
  '/api/team/targets',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const monthKey =
        typeof req.query.month === 'string' ? req.query.month : undefined;
      const items = await fetchTeamTargets(monthKey);
      res.json(items);
    } catch (error) {
      console.error('GET /api/team/targets failed:', error);
      res.status(500).json({ error: 'Failed to load team targets.' });
    }
  }
);

app.post(
  '/api/team/targets',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const body = req.body as {
        userId?: number;
        monthKey?: string;
        leadsTarget?: number;
        wonTarget?: number;
        revenueTarget?: number;
        notes?: string | null;
      };
      const actor = req.dbUser!.displayName || req.dbUser!.username;
      const saved = await upsertTeamTargetRecord({
        userId: Number(body.userId),
        monthKey: body.monthKey || '',
        leadsTarget: Number(body.leadsTarget) || 0,
        wonTarget: Number(body.wonTarget) || 0,
        revenueTarget: Number(body.revenueTarget) || 0,
        notes: body.notes ?? null,
        actor,
      });
      res.json(saved);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to save team target.';
      res.status(400).json({ error: msg });
    }
  }
);

app.delete(
  '/api/team/targets/:id',
  requireAdminSession,
  requirePasswordChanged,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid target ID.' });
        return;
      }
      const deleted = await deleteTeamTargetRecord(id);
      if (!deleted) {
        res.status(404).json({ error: 'Team target not found.' });
        return;
      }
      res.json({ deleted: true, id });
    } catch (error) {
      console.error('DELETE /api/team/targets/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete team target.' });
    }
  }
);


// Public webhook endpoint for inbound CRM / WhatsApp leads (authenticated via shared secret)
async function handleInboundLeadWebhook(req: Request, res: Response) {
  try {
    const expectedSecret = await getOrEnsureAiSensyWebhookSecret();
    const headerSecret =
      (typeof req.headers['x-aisensy-secret'] === 'string' &&
        req.headers['x-aisensy-secret']) ||
      (typeof req.headers['x-webhook-secret'] === 'string' &&
        req.headers['x-webhook-secret']) ||
      '';
    const authHeader =
      typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : '';
    const queryToken =
      typeof req.query.token === 'string' ? req.query.token.trim() : '';

    const providedSecret = (headerSecret || authHeader || queryToken).trim();
    if (!constantTimeSecretMatch(providedSecret, expectedSecret)) {
      res.status(401).json({ error: 'Invalid or missing webhook secret.' });
      return;
    }

    const result = await ingestAiSensyWebhookLead(req.body);
    res.status(result.action === 'created' ? 201 : 200).json({
      ok: true,
      action: result.action,
      leadId: result.lead.id,
    });
  } catch (error) {
    console.error('Lead webhook failed:', error);
    const message =
      error instanceof Error ? error.message : 'Invalid webhook payload.';
    res.status(400).json({ error: message });
  }
}

app.post('/api/webhooks/leads', handleInboundLeadWebhook);
app.post('/api/webhooks/aisensy', handleInboundLeadWebhook);

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File exceeds the 10 MB maximum upload size.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error.';
  res.status(400).json({ error: message });
});

// Unknown API routes return clean JSON 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(hmrDisabled ? { ws: false } : {}),
      },
      ...(hmrDisabled
        ? {
            plugins: [
              {
                name: 'disable-hmr-client-ws',
                enforce: 'post' as const,
                transform(code: string, id: string) {
                  if (
                    id.endsWith('/vite/dist/client/client.mjs') ||
                    id.endsWith('\\vite\\dist\\client\\client.mjs') ||
                    id === '/@vite/client'
                  ) {
                    return {
                      code: code
                        .replace('console.debug("[vite] connecting...");', '')
                        .replace(
                          'transport.connect(createHMRHandler(handleMessage));',
                          '/* HMR WebSocket disabled when DISABLE_HMR=true */'
                        ),
                      map: null,
                    };
                  }
                },
              },
            ],
          }
        : {}),
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HostGraber Internal Pricing Portal running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
