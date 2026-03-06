import prisma from '../../prisma/client.js';
import { recalculateRating } from './rating.service.js';
import logger from '../utils/logger.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from '../utils/errors.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

async function enqueueOutboxEvent(tx, eventType, reviewId, payload) {
  await tx.reviewOutboxEvent.create({
    data: { reviewId: reviewId ?? null, eventType, payload },
  });
}

// ─── Delivery Verification ────────────────────────────────────────────────
//
// Before a review is submitted, confirm the order was delivered and that the
// order actually contains the product being reviewed.
// Data comes from the local DeliveredOrder cache (populated by RabbitMQ consumer).

async function assertOrderDelivered(orderId, userId, productId) {
  const deliveredOrder = await prisma.deliveredOrder.findUnique({
    where: { orderId },
  });

  if (!deliveredOrder) {
    throw new AppError(
      403,
      'You can only review products from a delivered order',
      'ORDER_NOT_DELIVERED',
    );
  }

  if (deliveredOrder.userId !== userId) {
    throw new ForbiddenError('This order does not belong to you');
  }

  if (!deliveredOrder.productIds.includes(productId)) {
    throw new AppError(
      403,
      `Product ${productId} was not in order ${orderId}`,
      'PRODUCT_NOT_IN_ORDER',
    );
  }
}

// ─── Create Review ────────────────────────────────────────────────────────

export async function createReview({ productId, userId, orderId, rating, title, body }) {
  // 1. Verify the order was delivered and contains this product
  await assertOrderDelivered(orderId, userId, productId);

  // 2. Check for duplicate review (also enforced at DB level by @@unique)
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
  });
  if (existing) {
    throw new ConflictError('You have already reviewed this product');
  }

  // 3. Create review + recalculate rating + enqueue event — all in one transaction
  const { review, rating: updatedRating } = await prisma.$transaction(async (tx) => {
    const r = await tx.review.create({
      data: { productId, userId, orderId, rating, title, body, status: 'PUBLISHED' },
    });

    const ratingData = await recalculateRating(tx, productId);

    await enqueueOutboxEvent(tx, 'review.created', r.id, {
      reviewId: r.id,
      productId,
      userId,
      rating,
    });

    await enqueueOutboxEvent(tx, 'review.rating_updated', null, {
      productId,
      averageRating: ratingData.averageRating,
      totalReviews: ratingData.totalReviews,
    });

    return { review: r, rating: ratingData };
  });

  logger.info({ msg: 'Review created', reviewId: review.id, productId, userId });
  return { review, rating: updatedRating };
}

// ─── Update Review ────────────────────────────────────────────────────────

export async function updateReview({ reviewId, userId, rating, title, body }) {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } });

  if (!existing) throw new NotFoundError('Review');
  if (existing.userId !== userId) throw new ForbiddenError('You can only edit your own reviews');
  if (existing.status === 'REJECTED') {
    throw new ConflictError('Rejected reviews cannot be edited');
  }

  const { review, rating: updatedRating } = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({
      where: { id: reviewId },
      data: {
        ...(rating !== undefined && { rating }),
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
      },
    });

    const ratingData = await recalculateRating(tx, r.productId);

    await enqueueOutboxEvent(tx, 'review.updated', r.id, {
      reviewId: r.id,
      productId: r.productId,
      userId,
      rating: r.rating,
    });

    await enqueueOutboxEvent(tx, 'review.rating_updated', null, {
      productId: r.productId,
      averageRating: ratingData.averageRating,
      totalReviews: ratingData.totalReviews,
    });

    return { review: r, rating: ratingData };
  });

  logger.info({ msg: 'Review updated', reviewId, userId });
  return { review, rating: updatedRating };
}

// ─── Delete Review ────────────────────────────────────────────────────────

export async function deleteReview({ reviewId, userId, isAdmin }) {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } });

  if (!existing) throw new NotFoundError('Review');
  if (!isAdmin && existing.userId !== userId) {
    throw new ForbiddenError('You can only delete your own reviews');
  }

  const productId = existing.productId;

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });

    const ratingData = await recalculateRating(tx, productId);

    await enqueueOutboxEvent(tx, 'review.deleted', reviewId, {
      reviewId,
      productId,
      userId: existing.userId,
    });

    await enqueueOutboxEvent(tx, 'review.rating_updated', null, {
      productId,
      averageRating: ratingData.averageRating,
      totalReviews: ratingData.totalReviews,
    });
  });

  logger.info({ msg: 'Review deleted', reviewId, by: userId });
}

// ─── Get Single Review ────────────────────────────────────────────────────

export async function getReviewById(reviewId) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new NotFoundError('Review');
  return review;
}

// ─── List Reviews for a Product ───────────────────────────────────────────

const SORT_MAP = {
  newest:  { createdAt: 'desc' },
  oldest:  { createdAt: 'asc' },
  highest: { rating: 'desc' },
  lowest:  { rating: 'asc' },
  helpful: { helpfulCount: 'desc' },
};

export async function listReviewsByProduct({ productId, page, limit, rating, sort }) {
  const where = {
    productId,
    status: 'PUBLISHED',
    ...(rating ? { rating } : {}),
  };

  const orderBy = SORT_MAP[sort] ?? SORT_MAP.newest;
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({ where, orderBy, skip, take: limit }),
    prisma.review.count({ where }),
  ]);

  return {
    data: reviews,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

// ─── Get My Review for a Product ─────────────────────────────────────────

export async function getMyReview({ productId, userId }) {
  const review = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
  });
  if (!review) throw new NotFoundError('Review');
  return review;
}

// ─── Vote (Helpful / Not Helpful) ─────────────────────────────────────────

export async function voteReview({ reviewId, userId, helpful }) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new NotFoundError('Review');

  // Users cannot vote on their own review
  if (review.userId === userId) {
    throw new ForbiddenError('You cannot vote on your own review');
  }

  const existing = await prisma.reviewHelpfulVote.findUnique({
    where: { reviewId_userId: { reviewId, userId } },
  });

  if (existing) {
    if (existing.helpful === helpful) {
      throw new ConflictError('You have already cast this vote');
    }

    // Changing vote: flip the counts
    await prisma.$transaction(async (tx) => {
      await tx.reviewHelpfulVote.update({
        where: { reviewId_userId: { reviewId, userId } },
        data: { helpful },
      });

      await tx.review.update({
        where: { id: reviewId },
        data: {
          helpfulCount:    { increment: helpful ? 1 : -1 },
          notHelpfulCount: { increment: helpful ? -1 : 1 },
        },
      });
    });
  } else {
    // New vote
    await prisma.$transaction(async (tx) => {
      await tx.reviewHelpfulVote.create({
        data: { reviewId, userId, helpful },
      });

      await tx.review.update({
        where: { id: reviewId },
        data: {
          helpfulCount:    { increment: helpful ? 1 : 0 },
          notHelpfulCount: { increment: helpful ? 0 : 1 },
        },
      });
    });
  }

  logger.info({ msg: 'Vote cast', reviewId, userId, helpful });
  return prisma.review.findUnique({ where: { id: reviewId } });
}

// ─── Admin: Moderate Review ───────────────────────────────────────────────

export async function moderateReview({ reviewId, status, adminId }) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new NotFoundError('Review');

  const { review: updated, rating: updatedRating } = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({
      where: { id: reviewId },
      data: { status },
    });

    // Recalculate because REJECTED reviews are excluded from aggregation
    const ratingData = await recalculateRating(tx, r.productId);

    await enqueueOutboxEvent(tx, 'review.moderated', r.id, {
      reviewId: r.id,
      productId: r.productId,
      status,
      moderatedBy: adminId,
    });

    if (status === 'REJECTED') {
      await enqueueOutboxEvent(tx, 'review.rating_updated', null, {
        productId: r.productId,
        averageRating: ratingData.averageRating,
        totalReviews: ratingData.totalReviews,
      });
    }

    return { review: r, rating: ratingData };
  });

  logger.info({ msg: 'Review moderated', reviewId, status, adminId });
  return { review: updated, rating: updatedRating };
}