import { Router }      from 'express';
import orderController from '../controllers/orderController.js';
import asyncHandler    from '../middleware/asyncHandler.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();

router.post(
  '/',
  validate({ body: schemas.CreateOrderSchema }),
  asyncHandler(orderController.createOrder)
);

router.get(
  '/customer/:customerId',
  validate({ params: schemas.CustomerUUIDParam, query: schemas.PaginationQuery }),
  asyncHandler(orderController.getOrdersByCustomer)
);

router.get(
  '/:id',
  validate({ params: schemas.UUIDParam }),
  asyncHandler(orderController.getOrder)
);

router.post(
  '/:id/checkout',
  validate({ params: schemas.UUIDParam }),
  asyncHandler(orderController.checkoutOrder)
);

router.post(
  '/:id/ship',
  validate({ params: schemas.UUIDParam }),
  asyncHandler(orderController.shipOrder)
);

router.post(
  '/:id/deliver',
  validate({ params: schemas.UUIDParam }),
  asyncHandler(orderController.deliverOrder)
);

router.post(
  '/:id/cancel',
  validate({ params: schemas.UUIDParam, body: schemas.CancelOrderSchema }),
  asyncHandler(orderController.cancelOrder)
);

export default router;
