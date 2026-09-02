const db = require('../repositories/dbStore');
const asyncHandler = require('../utils/asyncHandler');
const { toNumber } = require('../utils/number');

const ok = (res, data) => res.json({ success: true, data });

async function getAccessibleTicket(id, user) {
  const ticket = await db.getTicket(id);
  if (!ticket) {
    const error = new Error('ticket not found');
    error.status = 404;
    throw error;
  }

  if (user.role !== 'Admin' && toNumber(ticket.user_id) !== toNumber(user.id)) {
    const error = new Error('forbidden');
    error.status = 403;
    throw error;
  }

  return ticket;
}

exports.create = asyncHandler(async (req, res) => ok(res, await db.createTicket(req.user.id, req.body)));
exports.faqs = asyncHandler(async (req, res) => {
  const audience = req.user.role === 'Seller' ? 'seller' : 'user';
  const items = JSON.parse(await db.getSetting('support_faqs', '[]') || '[]');
  ok(res, items.filter((item) => item.audience === audience));
});
exports.my = asyncHandler(async (req, res) => ok(res, await db.listTickets({ userId: req.user.id })));
exports.get = asyncHandler(async (req, res) => ok(res, await getAccessibleTicket(req.params.id, req.user)));
exports.reply = asyncHandler(async (req, res) => {
  await getAccessibleTicket(req.params.id, req.user);
  ok(res, await db.replyTicket(req.params.id, req.user.id, req.body));
});
exports.close = asyncHandler(async (req, res) => {
  await getAccessibleTicket(req.params.id, req.user);
  ok(res, await db.closeTicket(req.params.id));
});
