export function ticketPath(role, ticketId) {
  const base = role === 'Admin' ? '/admin/support/tickets' : role === 'Seller' ? '/seller/tickets' : '/user/tickets';
  return `${base}/${ticketId}`;
}

export function openTicketInNewTab(role, ticketId) {
  const url = ticketPath(role, ticketId);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}
