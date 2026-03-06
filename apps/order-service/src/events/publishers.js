import { ROUTING_KEYS } from '../config/rabbitmq.js';

async function outboxWrite(tx, routingKey, orderId, payload) {
  return tx.outboxEvent.create({
    data: { orderId: orderId || null, routingKey, payload },
  });
}

export const publishOrderCreated    = (tx, o) => outboxWrite(tx, ROUTING_KEYS.ORDER_CREATED,    o.id, { orderId: o.id, orderReference: o.orderReference, customerId: o.customerId, totalCents: o.totalCents });
export const publishOrderConfirmed  = (tx, o) => outboxWrite(tx, ROUTING_KEYS.ORDER_CONFIRMED,  o.id, { orderId: o.id, customerId: o.customerId, totalCents: o.totalCents });
export const publishOrderShipped    = (tx, o) => outboxWrite(tx, ROUTING_KEYS.ORDER_SHIPPED,    o.id, { orderId: o.id, customerId: o.customerId });
export const publishOrderDelivered  = (tx, o) => outboxWrite(tx, ROUTING_KEYS.ORDER_DELIVERED,  o.id, { orderId: o.id, customerId: o.customerId });
export const publishOrderCancelled  = (tx, o, reason) => outboxWrite(tx, ROUTING_KEYS.ORDER_CANCELLED, o.id, { orderId: o.id, customerId: o.customerId, orderReference: o.orderReference, inventoryReservationId: o.inventoryReservationId, paymentReference: o.paymentReference, reason });
export const publishCheckoutInitiated = (tx, o) => outboxWrite(tx, ROUTING_KEYS.CHECKOUT_INITIATED, o.id, { orderId: o.id, customerId: o.customerId, totalCents: o.totalCents, items: o.items });
export const publishInventoryReleaseRequested = (tx, orderId, reservationId) =>
  outboxWrite(tx, ROUTING_KEYS.INVENTORY_RELEASE_REQUESTED, orderId, { orderId, reservationId });
