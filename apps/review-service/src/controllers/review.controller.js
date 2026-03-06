import * as reviewService from '../services/review.service.js';
import * as ratingService from '../services/rating.service.js';
import prisma from '../prisma/client.js';
import logger from '../utils/logger.js';

// ─── Create Review ─────────────────────────────────────────────────────────

export async function createReview(req, res, next) {
  try {
    const { productId, orderId, rating, title, body } = req.body;
    const userId = req.user.id;

    const result = await reviewService.createReview({ productId, userId, orderId, rating, title, body });

    logger.info({ msg: 'Review created', reviewId: result.review.id, requestId: req.requestId });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Update Review ─────────────────────────────────────────────────────────

export async function updateReview(req, res, next) {
  try {
    const { reviewId } = req.params;
    const { rating, title, body } = req.body;
    const userId = req.user.id;

    const result = await reviewService.updateReview({ reviewId, userId, rating, title, body });

    logger.info({ msg: 'Review updated', reviewId, requestId: req.requestId });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Delete Review ─────────────────────────────────────────────────────────

export async function deleteReview(req, res, next) {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    await reviewService.deleteReview({ reviewId, userId, isAdmin });

    return res.json({ success: true, message: 'Review deleted' });
  } catch (err) {
    next(err);
  }
}

// ─── Get Review by ID ──────────────────────────────────────────────────────

export async function getReview(req, res, next) {
  try {
    const { reviewId } = req.params;
    const review = await reviewService.getReviewById(reviewId);
    return res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
}

// ─── List Reviews for a Product ────────────────────────────────────────────

export async function listReviews(req, res, next) {
  try {
    const { productId } = req.params;
    const { page, limit, rating, sort } = req.query;

    const result = await reviewService.listReviewsByProduct({ productId, page, limit, rating, sort });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ─── Get My Review for a Product ──────────────────────────────────────────

export async function getMyReview(req, res, next) {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    const review = await reviewService.getMyReview({ productId, userId });
    return res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
}

// ─── Get Product Rating ────────────────────────────────────────────────────

export async function getProductRating(req, res, next) {
  try {
    const { productId } = req.params;
    const rating = await ratingService.getProductRating(prisma, productId);

    if (!rating) {
      return res.json({
        success: true,
        data: {
          productId,
          averageRating: 0,
          totalReviews: 0,
          oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0,
        },
      });
    }

    return res.json({ success: true, data: rating });
  } catch (err) {
    next(err);
  }
}

// ─── Vote (Helpful / Not Helpful) ─────────────────────────────────────────

export async function voteReview(req, res, next) {
  try {
    const { reviewId } = req.params;
    const { helpful } = req.body;
    const userId = req.user.id;

    const updated = await reviewService.voteReview({ reviewId, userId, helpful });
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Admin: Moderate Review ────────────────────────────────────────────────

export async function moderateReview(req, res, next) {
  try {
    const { reviewId } = req.params;
    const { status } = req.body;
    const adminId = req.user.id;

    const result = await reviewService.moderateReview({ reviewId, status, adminId });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── INTERNAL: Get Rating by Product (for Catalog/Search) ─────────────────

export async function internalGetRating(req, res, next) {
  try {
    const { productId } = req.params;
    const rating = await ratingService.getProductRating(prisma, productId);

    return res.json({
      success: true,
      data: rating ?? {
        productId,
        averageRating: 0,
        totalReviews: 0,
        oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0,
      },
    });
  } catch (err) {
    next(err);
  }
}