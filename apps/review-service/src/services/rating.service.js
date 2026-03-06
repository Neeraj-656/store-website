// rating.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles all ProductRating aggregation logic.
// Called inside transactions whenever a review is created, updated, or deleted.
// Also enqueues review.rating_updated events for Catalog/Search services
// to re-index product metadata.
// ─────────────────────────────────────────────────────────────────────────────

const STAR_FIELD = {
  1: 'oneStar',
  2: 'twoStar',
  3: 'threeStar',
  4: 'fourStar',
  5: 'fiveStar',
};

/**
 * Recalculate and upsert ProductRating for a product.
 * Called inside a prisma.$transaction — receives `tx` not `prisma`.
 *
 * @param {object} tx - Prisma transaction client
 * @param {string} productId
 */
export async function recalculateRating(tx, productId) {
  // Aggregate all PUBLISHED reviews for this product
  const [counts, avgResult] = await Promise.all([
    tx.review.groupBy({
      by: ['rating'],
      where: { productId, status: 'PUBLISHED' },
      _count: { rating: true },
    }),
    tx.review.aggregate({
      where: { productId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);

  // Build star breakdown
  const starBreakdown = { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0 };
  for (const row of counts) {
    const field = STAR_FIELD[row.rating];
    if (field) starBreakdown[field] = row._count.rating;
  }

  const totalReviews = avgResult._count.rating;
  const averageRating = totalReviews > 0
    ? Math.round((avgResult._avg.rating + Number.EPSILON) * 100) / 100
    : 0;

  await tx.productRating.upsert({
    where: { productId },
    create: {
      productId,
      averageRating,
      totalReviews,
      ...starBreakdown,
    },
    update: {
      averageRating,
      totalReviews,
      ...starBreakdown,
    },
  });

  return { productId, averageRating, totalReviews, ...starBreakdown };
}

/**
 * Get the current rating for a product.
 * Returns null if no reviews exist yet.
 *
 * @param {object} prisma - Prisma client
 * @param {string} productId
 */
export async function getProductRating(prisma, productId) {
  return prisma.productRating.findUnique({ where: { productId } });
}