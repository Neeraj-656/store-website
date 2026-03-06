import * as orderService from '../services/orderService.js';

const orderController = {
  async createOrder(req, res) {
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'x-idempotency-key header is required. Generate a UUID client-side and reuse it on retries.',
      });
    }
    const order = await orderService.createOrder({ ...req.body, idempotencyKey });
    req.log?.info(`Order created: ${order.id}`);
    res.status(201).json(order);
  },

  async getOrder(req, res) {
    res.json(await orderService.getOrderById(req.params.id));
  },

  async getOrdersByCustomer(req, res) {
    res.json(await orderService.getOrdersByCustomer(req.params.customerId, req.query));
  },

  async checkoutOrder(req, res) {
    const order = await orderService.checkoutOrder(req.params.id);
    res.json({ message: 'Checkout queued. The saga will handle inventory + payment.', order });
  },

  async shipOrder(req, res) {
    res.json(await orderService.shipOrder(req.params.id, 'admin'));
  },

  async deliverOrder(req, res) {
    res.json(await orderService.deliverOrder(req.params.id, 'system'));
  },

  async cancelOrder(req, res) {
    res.json(await orderService.cancelOrder(req.params.id, req.body?.reason, 'customer'));
  },
};

export default orderController;
