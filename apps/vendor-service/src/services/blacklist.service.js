// blacklist.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin-managed blacklist for PAN / GSTIN / bank account numbers.
// Values are stored as SHA-256 hashes — no raw identifier is ever written to DB.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../../prisma/client.js';
import { hashIdentifier } from '../utils/crypto.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function addToBlacklist({ type, value, reason, adminId }) {
  const hashed = hashIdentifier(value);

  const existing = await prisma.blacklistedIdentifier.findUnique({
    where: { type_value: { type, value: hashed } },
  });

  if (existing) throw new ConflictError(`${type} is already blacklisted`);

  const entry = await prisma.blacklistedIdentifier.create({
    data: { type, value: hashed, reason, addedBy: adminId },
  });

  logger.info({ msg: 'Identifier blacklisted', type, addedBy: adminId });

  // Return without the hashed value — no need to expose it
  return { id: entry.id, type, reason, addedBy: entry.addedBy, createdAt: entry.createdAt };
}

export async function removeFromBlacklist({ type, value, adminId }) {
  const hashed = hashIdentifier(value);

  const existing = await prisma.blacklistedIdentifier.findUnique({
    where: { type_value: { type, value: hashed } },
  });

  if (!existing) throw new NotFoundError('Blacklist entry');

  await prisma.blacklistedIdentifier.delete({
    where: { type_value: { type, value: hashed } },
  });

  logger.info({ msg: 'Identifier removed from blacklist', type, removedBy: adminId });
}

export async function listBlacklist({ type, page = 1, limit = 20 }) {
  const where = type ? { type } : {};

  const [entries, total] = await Promise.all([
    prisma.blacklistedIdentifier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      // Never return the hashed value
      select: { id: true, type: true, reason: true, addedBy: true, createdAt: true },
    }),
    prisma.blacklistedIdentifier.count({ where }),
  ]);

  return { data: entries, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}
