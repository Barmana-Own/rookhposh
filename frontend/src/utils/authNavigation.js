export function accountHome(user) {
  if (user?.role === 'Admin') return '/admin';
  if (user?.role !== 'Seller') return '/seller';
  return String(user.seller_verification_status || '').toLowerCase() === 'approved'
    ? '/seller/dashboard'
    : '/seller/status';
}

export function postLoginPath(user, requestedPath) {
  const home = accountHome(user);
  if (home !== '/seller/dashboard' || typeof requestedPath !== 'string') return home;
  for (const character of requestedPath) {
    const code = character.charCodeAt(0);
    if (character === '\\' || code < 32 || code === 127) return home;
  }
  try {
    const base = 'https://dashboard.invalid';
    const destination = new URL(requestedPath, base);
    if (destination.origin !== base || !destination.pathname.startsWith('/seller/')) return home;
    if (destination.pathname === '/seller/') return home;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return home;
  }
}
