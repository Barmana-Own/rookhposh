const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { unlimitedProUserMobiles } = require('../config/env');
const { normalizeContactPhone, normalizeDigits, normalizeMobile, toNumber } = require('../utils/number');
const { isLegacyStoreSlug, slugifyStoreName } = require('../utils/storeSlug');

const safeUser = (user) => {
  if (!user) return null;
  const { password, pro_unlimited, ...safe } = user;
  return safe;
};

const roleValue = (role = 'User') => {
  const lower = String(role).toLowerCase();
  if (lower === 'admin') return 'Admin';
  if (lower === 'seller') return 'Seller';
  return 'User';
};

const configuredUnlimitedProMobiles = new Set(
  String(unlimitedProUserMobiles || '')
    .split(',')
    .map((mobile) => normalizeMobile(mobile))
    .filter((mobile) => /^\d{10,15}$/u.test(mobile)),
);

function isUnlimitedProMobile(mobile) {
  return configuredUnlimitedProMobiles.has(normalizeMobile(mobile));
}

function hasUnlimitedProAccess(user) {
  return roleValue(user?.role) === 'User' && Number(user?.pro_unlimited) === 1;
}

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

const MAX_PAGE_SIZE = 100;

function normalizePagination(page, limit, fallbackLimit = 50) {
  const parsedPage = Math.max(1, Math.trunc(toNumber(page, 1)) || 1);
  const parsedLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(toNumber(limit, fallbackLimit)) || fallbackLimit));
  return {
    page: parsedPage,
    limit: parsedLimit,
    offset: (parsedPage - 1) * parsedLimit,
  };
}

function paginationMeta(page, limit, total) {
  return {
    page,
    pageSize: limit,
    total: Number(total || 0),
    totalPages: Math.max(1, Math.ceil(Number(total || 0) / limit)),
  };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function uniqueStoreSlug(connection, storeName, sellerId, currentSlug = '') {
  const base = slugifyStoreName(storeName, `seller-${sellerId}`);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [rows] = await connection.query(
      'SELECT id FROM stores WHERE slug=? AND seller_id<>? LIMIT 1',
      [candidate, sellerId],
    );
    if (!rows.length || candidate === currentSlug) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

async function canonicalStoreSlug(store) {
  if (!store || !isLegacyStoreSlug(store.slug)) return store;
  const preferredSlug = await uniqueStoreSlug(pool, store.store_name, store.seller_id, store.slug);
  if (preferredSlug === store.slug) return store;
  await pool.query(
    'UPDATE stores SET slug=?, legacy_slug=COALESCE(legacy_slug, ?), qr_code=NULL WHERE id=?',
    [preferredSlug, store.slug, store.id],
  );
  return { ...store, slug: preferredSlug, legacy_slug: store.legacy_slug || store.slug, qr_code: null };
}

async function findUserByUsername(username) {
  const value = normalizeDigits(username);
  const rows = await query('SELECT * FROM users WHERE username=? OR email=? OR mobile=? LIMIT 1', [value, value, value]);
  return rows[0] || null;
}

async function findUserByMobileAndRole(mobile, role) {
  const value = normalizeDigits(mobile).trim();
  const variants = new Set([value]);
  if (value.startsWith('0')) {
    variants.add(`+98${value.slice(1)}`);
    variants.add(`0098${value.slice(1)}`);
  }
  if (value.startsWith('+98')) variants.add(`0${value.slice(3)}`);
  if (value.startsWith('0098')) variants.add(`0${value.slice(4)}`);
  const values = [...variants];
  const requestedRole = roleValue(role);
  const orderBy = requestedRole === 'Seller'
    ? `ORDER BY
         CASE LOWER(COALESCE(seller_verification_status, 'none'))
           WHEN 'approved' THEN 0
           WHEN 'pending' THEN 1
           WHEN 'none' THEN 2
           WHEN 'rejected' THEN 3
           ELSE 4
         END,
         CASE WHEN status='active' THEN 0 ELSE 1 END,
         id DESC`
    : `ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, id DESC`;
  const rows = await query(
    `SELECT * FROM users WHERE mobile IN (${values.map(() => '?').join(',')}) AND role=? ${orderBy} LIMIT 1`,
    [...values, requestedRole],
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const rows = await query('SELECT * FROM users WHERE id=? LIMIT 1', [id]);
  return safeUser(rows[0]);
}

async function rawUserById(id, connection = pool) {
  const [rows] = await connection.query('SELECT * FROM users WHERE id=? LIMIT 1', [id]);
  return rows[0] || null;
}

async function adminUsers(connection = pool) {
  const [rows] = await connection.query('SELECT id, fullname FROM users WHERE role="Admin" AND status="active"');
  return rows;
}

async function createNotification(userId, title, body, type = 'general', relatedId = null, connection = pool) {
  if (!userId) return null;
  const [result] = await connection.query(
    'INSERT INTO notifications(user_id,title,body,type,related_id,is_read) VALUES(?,?,?,?,?,0)',
    [userId, title, body || '', type, relatedId],
  );
  return result.insertId;
}

async function notifyAdmins(title, body, type = 'admin', relatedId = null, connection = pool) {
  const admins = await adminUsers(connection);
  if (!admins.length) return [];
  const values = admins.flatMap((admin) => [admin.id, title, body || '', type, relatedId]);
  const placeholders = admins.map(() => '(?,?,?,?,?,0)').join(',');
  const [result] = await connection.query(
    `INSERT INTO notifications(user_id,title,body,type,related_id,is_read) VALUES${placeholders}`,
    values,
  );
  return admins.map((admin, index) => Number(result.insertId) + index);
}

async function listNotifications(userId) {
  return query(
    `SELECT id, title, body, type, related_id, created_at, is_read
     FROM notifications
     WHERE user_id=?
     ORDER BY id DESC
     LIMIT 30`,
    [userId],
  );
}

async function markNotificationsRead(userId) {
  await pool.query('UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0', [userId]);
  return { success: true };
}

async function listUsers({ role, page, limit, includeMeta = false } = {}) {
  const params = [];
  let where = '';
  if (role) {
    where = 'WHERE role=?';
    params.push(roleValue(role));
  }
  const paginated = includeMeta || page != null || limit != null;
  const pagination = paginated ? normalizePagination(page, limit, 50) : null;
  const rows = await query(
    `SELECT
       u.id, u.fullname, u.username, u.email, u.mobile, u.national_code,
       u.role, u.status, u.seller_verification_status, u.seller_reject_reason,
       u.wallet_balance, u.created_at, u.updated_at,
       s.store_name
     FROM users u
     LEFT JOIN stores s ON s.seller_id=u.id
     ${where}
     ORDER BY u.id DESC
     ${paginated ? 'LIMIT ? OFFSET ?' : ''}`,
    paginated ? [...params, pagination.limit, pagination.offset] : params,
  );
  const items = rows.map((row) => ({ ...safeUser(row), store_name: row.store_name || '' }));
  if (!includeMeta) return items;

  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
  return { items, pagination: paginationMeta(pagination.page, pagination.limit, count.total) };
}

async function updateAdminUser(id, payload) {
  const current = await findUserById(id);
  if (!current) {
    const error = new Error('user not found');
    error.status = 404;
    throw error;
  }

  const fields = [
    payload.fullname ?? current.fullname,
    payload.username ?? current.username,
    payload.email ?? current.email,
    payload.mobile == null ? current.mobile : normalizeMobile(payload.mobile),
    payload.national_code == null ? current.national_code : normalizeDigits(payload.national_code),
    toNumber(payload.wallet_balance ?? current.wallet_balance ?? 0),
    id,
  ];

  await pool.query(
    `UPDATE users
     SET fullname=?, username=?, email=?, mobile=?, national_code=?, wallet_balance=?
     WHERE id=? AND role!="Admin"`,
    fields,
  );

  if (payload.password) {
    const password = await bcrypt.hash(payload.password, 10);
    await pool.query('UPDATE users SET password=? WHERE id=? AND role!="Admin"', [password, id]);
  }

  if (current.role === 'Seller' && typeof payload.store_name === 'string' && payload.store_name.trim()) {
    const storeRows = await query('SELECT * FROM stores WHERE seller_id=? LIMIT 1', [id]);
    const currentStore = storeRows[0];
    const storeName = payload.store_name.trim();
    const slug = await uniqueStoreSlug(pool, storeName, id, currentStore?.slug);
    await pool.query('UPDATE stores SET store_name=?, slug=?, qr_code=NULL WHERE seller_id=?', [storeName, slug, id]);
  }

  return findUserById(id);
}

async function createUser(payload) {
  const role = roleValue(payload.role);
  const password = payload.password?.startsWith('$2') ? payload.password : await bcrypt.hash(payload.password || 'password', 10);
  const normalizedMobile = payload.mobile || payload.phone ? normalizeMobile(payload.mobile || payload.phone) : null;
  const unlimitedPro = role === 'User' && isUnlimitedProMobile(normalizedMobile) ? 1 : 0;
  let referredSellerId = payload.referred_seller_id || null;
  if (!referredSellerId && payload.referred_store_slug) {
    const store = await getStoreBySlug(payload.referred_store_slug);
    referredSellerId = store?.seller_id || null;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO users(
        fullname,username,email,mobile,avatar,province,city,address,postal_code,national_code,password,role,status,seller_verification_status,wallet_balance,pro_unlimited,referred_seller_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.fullname || payload.name,
        payload.username,
        payload.email || null,
        normalizedMobile,
        payload.avatar || null,
        payload.province || null,
        payload.city || null,
        payload.address || null,
        payload.postal_code || null,
        payload.national_code ? normalizeDigits(payload.national_code) : null,
        password,
        role,
        payload.status || 'active',
        payload.seller_verification_status || (role === 'Seller' ? 'pending' : 'none'),
        toNumber(payload.wallet_balance || 0),
        unlimitedPro,
        referredSellerId,
      ],
    );

    if (role === 'User' && referredSellerId) {
      await connection.query(
        `INSERT INTO seller_customers(seller_id,user_id,fullname,mobile,province,city,address,postal_code,national_code)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE fullname=VALUES(fullname), mobile=VALUES(mobile)`,
        [
          referredSellerId,
          result.insertId,
          payload.fullname || payload.name || '',
          normalizedMobile,
          payload.province || null,
          payload.city || null,
          payload.address || null,
          payload.postal_code || null,
          payload.national_code || null,
        ],
      );
    }

    if (role === 'Seller') {
      const storeName = payload.store_name || payload.fullname || payload.name || 'فروشگاه من';
      const slug = await uniqueStoreSlug(connection, storeName, result.insertId);
      await connection.query(
        'INSERT INTO stores(seller_id,store_name,slug,description,status) VALUES(?,?,?,?,?)',
        [result.insertId, storeName, slug, payload.description || '', 'active'],
      );
      await notifyAdmins(
        'درخواست فروشگاه جدید',
        `حساب فروشگاه ${payload.fullname || payload.username} ثبت شد و در انتظار تایید هویت است.`,
        'seller_verification',
        result.insertId,
        connection,
      );
    }

    await connection.commit();
    return findUserById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setUserStatus(id, status) {
  await pool.query('UPDATE users SET status=? WHERE id=?', [status, id]);
  return findUserById(id);
}

async function deleteUser(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM notifications WHERE user_id=?', [id]);
    await connection.query('DELETE FROM reviews WHERE user_id=? OR seller_id=?', [id, id]);
    await connection.query('DELETE tm FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id WHERE t.user_id=? OR tm.sender_id=?', [id, id]);
    await connection.query('DELETE FROM tickets WHERE user_id=?', [id]);
    await connection.query('DELETE FROM pro_usages WHERE user_id=?', [id]);
    await connection.query('DELETE FROM pro_uploads WHERE user_id=?', [id]);
    await connection.query('DELETE FROM transactions WHERE user_id=? OR seller_id=?', [id, id]);
    await connection.query('DELETE FROM seller_customers WHERE user_id=? OR seller_id=?', [id, id]);
    await connection.query('DELETE FROM products WHERE seller_id=?', [id]);
    await connection.query('DELETE FROM stores WHERE seller_id=?', [id]);
    const [result] = await connection.query('DELETE FROM users WHERE id=? AND role!="Admin"', [id]);
    await connection.commit();
    return { deleted: result.affectedRows > 0 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setSellerVerification(id, status, reason = null) {
  const current = await rawUserById(id);
  if (!current || current.role !== 'Seller') return null;
  const wasAlreadyInRequestedState = String(current.seller_verification_status || '').toLowerCase() === status
    && (status !== 'rejected' || current.seller_reject_reason === (reason || null));

  if (status === 'approved') {
    await pool.query(
      `UPDATE users
       SET seller_verification_status='approved', seller_reject_reason=NULL,
           status=IF(status='blocked','blocked','active')
       WHERE id=? AND role="Seller"`,
      [id],
    );
  } else {
    await pool.query(
      'UPDATE users SET seller_verification_status=?, seller_reject_reason=? WHERE id=? AND role="Seller"',
      [status, reason, id],
    );
  }
  const seller = await findUserById(id);
  if (seller && !wasAlreadyInRequestedState) {
    if (status === 'approved') {
      await createNotification(id, 'هویت فروشگاه تایید شد', 'احراز هویت فروشگاه شما تایید شد و اکنون می‌توانید فروشگاه خود را فعالانه مدیریت کنید.', 'seller_verification', id);
    } else if (status === 'rejected') {
      await createNotification(id, 'هویت فروشگاه رد شد', reason || 'مدارک ارسالی برای تایید هویت کافی نبود.', 'seller_verification', id);
    }
  }
  return seller;
}

function normalizeImages(images) {
  let source = images;
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source);
      source = Array.isArray(parsed) ? parsed : [source];
    } catch {
      source = [source];
    }
  }
  if (!Array.isArray(source)) source = source ? [source] : [];
  return source
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProductFeatures(features) {
  let source = features;
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source);
      source = Array.isArray(parsed) ? parsed : [source];
    } catch {
      source = [source];
    }
  }
  if (!Array.isArray(source)) source = source ? [source] : [];
  return [...new Set(
    source
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .flatMap((item) => String(item || '').split(/[\n,،;؛|•]+/u))
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, 8);
}

async function updateUserProfile(id, payload) {
  await pool.query(
    `UPDATE users
     SET fullname=?, email=?, mobile=?, avatar=?, province=?, city=?, address=?, postal_code=?, national_code=?
     WHERE id=?`,
    [
      payload.fullname,
      payload.email || null,
      payload.mobile ? normalizeMobile(payload.mobile) : null,
      payload.avatar || null,
      payload.province || null,
      payload.city || null,
      payload.address || null,
      payload.postal_code || null,
      payload.national_code ? normalizeDigits(payload.national_code) : null,
      id,
    ],
  );
  return findUserById(id);
}

async function listProducts({
  sellerId,
  productId,
  status,
  search,
  page,
  limit,
  includeMeta = false,
  includeImages = true,
  imageLimit,
  includeQr = false,
  includeReviewStats = true,
  excludePendingChanges = false,
  compactImages = false,
} = {}) {
  const where = [];
  const params = [];

  if (sellerId) {
    where.push('p.seller_id=?');
    params.push(sellerId);
  }
  if (productId) {
    where.push('p.id=?');
    params.push(productId);
  }
  if (status) {
    if (status === 'pending') {
      where.push('(p.status="pending" OR p.pending_changes IS NOT NULL)');
    } else if (status === 'active') {
      where.push('p.status="active" AND COALESCE(p.publish_status, "active")="active"');
      if (excludePendingChanges) where.push('p.pending_changes IS NULL');
    } else {
      where.push('p.status=?');
      params.push(status);
    }
  }
  if (search) {
    where.push('(p.title LIKE ? OR p.description LIKE ? OR u.fullname LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const paginated = includeMeta || page != null || limit != null;
  const pagination = paginated ? normalizePagination(page, limit, 50) : null;
  const compactImagePayload = Boolean(compactImages && includeImages);
  const imageSlotLimit = compactImagePayload
    ? Math.min(4, Math.max(1, Math.trunc(Number(imageLimit) || 1)))
    : 0;
  const productFields = [
    'p.id',
    'p.seller_id',
    'p.title',
    'p.description',
    'p.features',
    'p.price',
    'p.status',
    'p.publish_status',
    'p.reject_reason',
    'p.created_at',
    'p.updated_at',
    'p.price AS price_toman',
    'u.fullname AS seller_name',
    's.slug AS store_slug',
    's.store_name',
  ];
  if (compactImagePayload) {
    productFields.push(
      'COALESCE(JSON_LENGTH(p.images), 0) AS image_count',
      'COALESCE(JSON_LENGTH(JSON_EXTRACT(p.pending_changes, \'$.images\')), 0) AS pending_image_count',
      'JSON_REMOVE(p.pending_changes, \'$.images\') AS pending_changes',
    );
    for (let index = 0; index < imageSlotLimit; index += 1) {
      productFields.push(
        `JSON_UNQUOTE(JSON_EXTRACT(p.images, '$[${index}]')) AS image_${index}`,
        `JSON_UNQUOTE(JSON_EXTRACT(p.pending_changes, '$.images[${index}]')) AS pending_image_${index}`,
      );
    }
  } else {
    productFields.push('p.images', 'p.pending_changes');
  }
  if (includeQr) productFields.push('p.qr_code');
  if (includeReviewStats) {
    productFields.push(
      'COALESCE((SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv WHERE rv.product_id=p.id), 0) AS avg_rating',
      'COALESCE((SELECT COUNT(*) FROM reviews rc WHERE rc.product_id=p.id), 0) AS review_count',
    );
  } else {
    productFields.push('0 AS avg_rating', '0 AS review_count');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rowsPromise = query(
    `SELECT
       ${productFields.join(',\n       ')}
     FROM products p
     JOIN users u ON u.id=p.seller_id
     LEFT JOIN stores s ON s.seller_id=p.seller_id
     ${whereSql}
     ORDER BY p.id DESC
    ${paginated ? 'LIMIT ? OFFSET ?' : ''}`,
    paginated ? [...params, pagination.limit, pagination.offset] : params,
  );
  const countPromise = includeMeta
    ? pool.query(`SELECT COUNT(*) AS total FROM products p JOIN users u ON u.id=p.seller_id ${whereSql}`, params)
    : null;
  const [rows, countResult] = await Promise.all([rowsPromise, countPromise || Promise.resolve(null)]);

  const items = rows.map((row) => {
    const compactBaseImages = compactImagePayload
      ? Array.from({ length: imageSlotLimit }, (_, index) => row[`image_${index}`])
      : [];
    const allImages = compactImagePayload
      ? normalizeImages(compactBaseImages)
      : normalizeImages(parseJson(row.images, []));
    const changes = parseJson(row.pending_changes, null);
    const compactPendingImages = compactImagePayload
      ? Array.from({ length: imageSlotLimit }, (_, index) => row[`pending_image_${index}`])
      : [];
    const allPendingImages = compactImagePayload
      ? normalizeImages(compactPendingImages)
      : changes && typeof changes === 'object' ? normalizeImages(changes.images) : [];
    if (changes && typeof changes === 'object' && compactImagePayload) changes.images = allPendingImages;
    const imageCount = compactImagePayload && row.image_count != null
      ? Number(row.image_count)
      : allImages.length;
    const pendingImageCount = compactImagePayload && row.pending_image_count != null
      ? Number(row.pending_image_count)
      : allPendingImages.length;
    const visibleImages = includeImages
      ? (Number(imageLimit) > 0 ? allImages.slice(0, Number(imageLimit)) : allImages)
      : [];
    const visiblePendingImages = includeImages
      ? (Number(imageLimit) > 0 ? allPendingImages.slice(0, Number(imageLimit)) : allPendingImages)
      : [];
    const responseRow = { ...row };
    if (compactImagePayload) {
      delete responseRow.image_count;
      delete responseRow.pending_image_count;
      for (let index = 0; index < imageSlotLimit; index += 1) {
        delete responseRow[`image_${index}`];
        delete responseRow[`pending_image_${index}`];
      }
    }

    return {
      ...responseRow,
      features: normalizeProductFeatures(parseJson(row.features, [])),
      images: visibleImages,
      image_count: imageCount,
      pending_changes: changes && typeof changes === 'object'
        ? {
            ...changes,
            features: normalizeProductFeatures(changes.features),
            images: visiblePendingImages,
            image_count: pendingImageCount,
          }
        : changes,
      publish_status: row.publish_status || 'active',
      avg_rating: Number(row.avg_rating || 0),
      review_count: Number(row.review_count || 0),
    };
  });

  if (!includeMeta) return items;
  const [[count]] = countResult;
  return { items, pagination: paginationMeta(pagination.page, pagination.limit, count.total) };
}

async function createProduct(sellerId, payload) {
  const images = normalizeImages(payload.images);
  const features = normalizeProductFeatures(payload.features);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      'INSERT INTO products(seller_id,title,description,features,price,images,status,reject_reason,qr_code) VALUES(?,?,?,?,?,?,?,?,?)',
      [
        sellerId,
        payload.title,
        payload.description || '',
        JSON.stringify(features),
        toNumber(payload.price || payload.price_toman || 0),
        JSON.stringify(images),
        'pending',
        null,
        null,
      ],
    );
    const seller = await rawUserById(sellerId, connection);
    await notifyAdmins(
      'محصول جدید برای بررسی',
      `محصول ${payload.title} توسط ${seller?.fullname || 'فروشگاه'} ثبت شد و منتظر بررسی است.`,
      'product_review',
      result.insertId,
      connection,
    );
    await connection.commit();
    return (await listProducts({ sellerId })).find((item) => item.id === result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProduct(sellerId, productId, payload) {
  const product = await getProduct(productId);
  if (!product || product.seller_id !== Number(sellerId)) {
    const error = new Error('product not found');
    error.status = 404;
    throw error;
  }

  const nextImages = Array.isArray(payload.images)
    ? normalizeImages(payload.images)
    : normalizeImages(product.images);
  const nextChanges = {
    title: payload.title || product.title,
    description: payload.description ?? product.description,
    features: payload.features === undefined
      ? normalizeProductFeatures(product.features)
      : normalizeProductFeatures(payload.features),
    price: toNumber(payload.price || payload.price_toman || product.price || 0),
    images: nextImages,
  };

  if (product.status === 'active') {
    await pool.query(
      `UPDATE products
       SET pending_changes=?, reject_reason=NULL
       WHERE id=? AND seller_id=?`,
      [JSON.stringify(nextChanges), productId, sellerId],
    );
  } else {
    await pool.query(
      `UPDATE products
       SET title=?, description=?, features=?, price=?, images=?, status='pending', reject_reason=NULL, qr_code=NULL, pending_changes=NULL
       WHERE id=? AND seller_id=?`,
      [
        nextChanges.title,
        nextChanges.description,
        JSON.stringify(nextChanges.features),
        nextChanges.price,
        JSON.stringify(nextChanges.images),
        productId,
        sellerId,
      ],
    );
  }

  await notifyAdmins(
    'ویرایش محصول برای بررسی',
    `محصول ${payload.title || product.title} در فروشگاه ویرایش شد و دوباره نیاز به بررسی دارد.`,
    'product_review',
    productId,
  );

  return getProduct(productId);
}

async function setProductPublishStatus(sellerId, productId, publishStatus) {
  const product = await getProduct(productId);
  if (!product || product.seller_id !== Number(sellerId)) {
    const error = new Error('product not found');
    error.status = 404;
    throw error;
  }
  if (product.status !== 'active') {
    const error = new Error('only approved products can be activated or deactivated');
    error.status = 400;
    throw error;
  }
  const nextStatus = publishStatus === 'inactive' ? 'inactive' : 'active';
  await pool.query('UPDATE products SET publish_status=? WHERE id=? AND seller_id=?', [nextStatus, productId, sellerId]);
  return getProduct(productId);
}

async function getProduct(id) {
  const rows = await listProducts({ productId: toNumber(id) });
  return rows[0] || null;
}

async function setProductStatus(id, status, rejectReason = null) {
  const reason = status === 'rejected' ? rejectReason || 'رد شده توسط ادمین' : null;
  const current = await getProduct(id);
  if (!current) return null;

  if (status === 'active') {
    const changes = current.pending_changes;
    if (changes) {
      await pool.query(
        `UPDATE products
         SET title=?, description=?, features=?, price=?, images=?, status='active', reject_reason=NULL, pending_changes=NULL, qr_code=NULL
         WHERE id=?`,
        [
          changes.title || current.title,
          changes.description ?? current.description,
          JSON.stringify(normalizeProductFeatures(changes.features ?? current.features)),
          toNumber(changes.price || current.price || 0),
          JSON.stringify(normalizeImages(changes.images || current.images)),
          id,
        ],
      );
    } else {
      await pool.query('UPDATE products SET status="active", reject_reason=NULL, pending_changes=NULL WHERE id=?', [id]);
    }
  } else if (status === 'rejected' && current.status === 'active' && current.pending_changes) {
    await pool.query('UPDATE products SET pending_changes=NULL, reject_reason=? WHERE id=?', [reason, id]);
  } else {
    await pool.query('UPDATE products SET status=?, reject_reason=?, pending_changes=NULL WHERE id=?', [status, reason, id]);
  }

  const product = await getProduct(id);
  if (product) {
    if (status === 'active') {
      await createNotification(product.seller_id, 'محصول شما تایید شد', `محصول «${product.title}» توسط ادمین تایید شد و اکنون برای کاربران قابل خرید است.`, 'product_review', product.id);
    } else if (status === 'rejected') {
      await createNotification(product.seller_id, 'محصول شما رد شد', `محصول «${product.title}» رد شد. علت رد: ${reason}`, 'product_review', product.id);
    }
  }
  return product;
}

function mergeBuyerDetails(user, payload = {}) {
  return {
    fullname: payload.fullname || user.fullname || '',
    mobile: payload.mobile || user.mobile || '',
    province: payload.province || user.province || '',
    city: payload.city || user.city || '',
    address: payload.address || user.address || '',
    postal_code: payload.postal_code || user.postal_code || '',
    national_code: payload.national_code || user.national_code || '',
  };
}

function assertBuyerDetails(details) {
  const required = {
    fullname: 'نام و نام خانوادگی',
    mobile: 'شماره تماس',
    province: 'استان',
    city: 'شهر',
    address: 'آدرس',
    postal_code: 'کد پستی',
    national_code: 'کد ملی',
  };

  for (const [key, label] of Object.entries(required)) {
    if (!String(details[key] || '').trim()) {
      const error = new Error(`${label} برای ثبت خرید الزامی است.`);
      error.status = 400;
      throw error;
    }
  }
}

async function purchaseProduct(userId, productId, payload = {}) {
  const product = await getProduct(productId);
  if (!product || product.status !== 'active') {
    const error = new Error('product not available');
    error.status = 404;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const user = await rawUserById(userId, connection);
    const buyer = mergeBuyerDetails(user, payload);
    assertBuyerDetails(buyer);

    await connection.query(
      `UPDATE users
       SET fullname=?, mobile=?, province=?, city=?, address=?, postal_code=?, national_code=?
       WHERE id=?`,
      [buyer.fullname, buyer.mobile, buyer.province, buyer.city, buyer.address, buyer.postal_code, buyer.national_code, userId],
    );

    const transactionId = await spendWallet(
      userId,
      product.price,
      {
        seller_id: product.seller_id,
        product_id: product.id,
        type: 'product_purchase',
        description: `خرید محصول: ${product.title}`,
        metadata: {
          product_id: product.id,
          product_title: product.title,
          seller_name: product.seller_name,
          buyer_fullname: buyer.fullname,
          buyer_mobile: buyer.mobile,
          province: buyer.province,
          city: buyer.city,
          address: buyer.address,
          postal_code: buyer.postal_code,
          national_code: buyer.national_code,
        },
      },
      connection,
    );

    await connection.query(
      `INSERT INTO seller_customers(
        seller_id,user_id,fullname,mobile,province,city,address,postal_code,national_code,last_product_title,last_order_id,last_order_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE
        fullname=VALUES(fullname),
        mobile=VALUES(mobile),
        province=VALUES(province),
        city=VALUES(city),
        address=VALUES(address),
        postal_code=VALUES(postal_code),
        national_code=VALUES(national_code),
        last_product_title=VALUES(last_product_title),
        last_order_id=VALUES(last_order_id),
        last_order_at=NOW()`,
      [
        product.seller_id,
        userId,
        buyer.fullname,
        buyer.mobile,
        buyer.province,
        buyer.city,
        buyer.address,
        buyer.postal_code,
        buyer.national_code,
        product.title,
        transactionId,
      ],
    );

    await createNotification(
      userId,
      'خرید محصول ثبت شد',
      `محصول «${product.title}» با شماره سفارش ${transactionId} خریداری شد. لطفاً پس از دریافت، نظر خود را ثبت کنید.`,
      'product_purchase',
      transactionId,
      connection,
    );
    await createNotification(
      product.seller_id,
      'سفارش جدید برای فروشگاه شما',
      `محصول «${product.title}» توسط ${buyer.fullname} خریداری شد.`,
      'seller_order',
      transactionId,
      connection,
    );

    await connection.commit();
    return { product, transaction_id: transactionId, buyer };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listCustomers(sellerId) {
  return query(
    `SELECT
       sc.id,
       sc.created_at,
       sc.last_order_at,
       sc.last_order_id,
       sc.last_product_title,
       sc.fullname AS customer_fullname,
       sc.mobile AS customer_mobile,
       sc.province,
       sc.city,
       sc.address,
       sc.postal_code,
       sc.national_code,
       u.id AS user_id,
       u.fullname,
       u.username,
       u.email,
       u.mobile,
       u.status,
       COUNT(t.id) AS orders
     FROM seller_customers sc
     JOIN users u ON u.id=sc.user_id
     LEFT JOIN transactions t
       ON t.seller_id=sc.seller_id
      AND t.user_id=sc.user_id
      AND t.type='product_purchase'
      AND t.status='success'
     WHERE sc.seller_id=?
     GROUP BY
       sc.id, sc.created_at, sc.last_order_at, sc.last_order_id, sc.last_product_title,
       sc.fullname, sc.mobile, sc.province, sc.city, sc.address, sc.postal_code, sc.national_code,
       u.id, u.fullname, u.username, u.email, u.mobile, u.status
     ORDER BY COALESCE(sc.last_order_at, sc.created_at) DESC, sc.id DESC`,
    [sellerId],
  );
}

function rangeClause(range, params) {
  if (range === '1d') return 't.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
  if (range === '7d') return 't.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  if (range === '30d') return 't.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
  if (params.start_date && params.end_date) return 't.created_at BETWEEN ? AND ?';
  return '';
}

async function listTransactions(filters = {}) {
  const where = [];
  const params = [];
  if (filters.userId) {
    where.push('t.user_id=?');
    params.push(filters.userId);
  }
  if (filters.sellerId) {
    where.push('t.seller_id=?');
    params.push(filters.sellerId);
  }
  if (filters.type) {
    where.push('t.type=?');
    params.push(filters.type);
  }

  const range = rangeClause(filters.range, filters);
  if (range) {
    where.push(range);
    if (filters.start_date && filters.end_date) params.push(filters.start_date, filters.end_date);
  }

  const rows = await query(
    `SELECT
       t.*,
       buyer.fullname AS user_name,
       seller.fullname AS seller_name,
       buyer.email AS user_email,
       buyer.role AS user_role,
       p.title AS product_title,
       rv.id AS review_id,
       rv.rating AS review_rating
     FROM transactions t
     JOIN users buyer ON buyer.id=t.user_id
     LEFT JOIN users seller ON seller.id=t.seller_id
     LEFT JOIN products p ON p.id=t.product_id
     LEFT JOIN reviews rv ON rv.product_id=t.product_id AND rv.user_id=t.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.id DESC`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    metadata: parseJson(row.metadata, {}),
    reviewed: Boolean(row.review_id),
  }));
}

function normalizePaymentMethod(method) {
  return ['wallet', 'bank_transfer', 'direct_gateway'].includes(method) ? method : 'wallet';
}

async function createPendingPayment(userId, amount, transaction) {
  const normalizedAmount = toNumber(amount);
  const [result] = await pool.query(
    `INSERT INTO transactions(
      user_id,seller_id,product_id,package_id,type,amount,status,description,metadata
    ) VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      userId,
      transaction.seller_id || null,
      transaction.product_id || null,
      transaction.package_id || null,
      transaction.type,
      normalizedAmount,
      'pending',
      transaction.description,
      JSON.stringify(transaction.metadata || {}),
    ],
  );
  return result.insertId;
}

async function createGatewayPayment(userId, amount, transaction) {
  const normalizedAmount = toNumber(amount);
  const [result] = await pool.query(
    `INSERT INTO transactions(
      user_id,seller_id,product_id,package_id,type,amount,status,description,metadata
    ) VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      userId,
      transaction.seller_id || null,
      transaction.product_id || null,
      transaction.package_id || null,
      transaction.type,
      normalizedAmount,
      'success',
      transaction.description,
      JSON.stringify(transaction.metadata || {}),
    ],
  );
  return result.insertId;
}

async function chargeWallet(userId, amount, description = 'شارژ حساب', payload = {}) {
  const normalizedAmount = toNumber(amount);
  const paymentMethod = normalizePaymentMethod(payload.payment_method || 'direct_gateway');

  if (paymentMethod === 'bank_transfer') {
    const transactionId = await createPendingPayment(userId, amount, {
      type: 'wallet_charge',
      description,
      metadata: {
        source: 'bank_transfer',
        receipt: payload.receipt || null,
        pending_action: 'wallet_charge',
      },
    });
    return {
      wallet_balance: Number((await rawUserById(userId))?.wallet_balance || 0),
      transaction_id: transactionId,
      status: 'pending',
      amount: normalizedAmount,
    };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE users SET wallet_balance=wallet_balance+? WHERE id=?', [normalizedAmount, userId]);
    const [result] = await connection.query(
      'INSERT INTO transactions(user_id,type,amount,status,description,metadata) VALUES(?,?,?,?,?,?)',
      [userId, 'wallet_charge', normalizedAmount, 'success', description, JSON.stringify({ source: paymentMethod })],
    );
    const user = await rawUserById(userId, connection);
    await connection.commit();
    return { wallet_balance: Number(user.wallet_balance), transaction_id: result.insertId, status: 'success', amount: normalizedAmount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function spendWallet(userId, amount, transaction, providedConnection = null) {
  const normalizedAmount = toNumber(amount);
  const connection = providedConnection || await pool.getConnection();
  const ownsConnection = !providedConnection;
  try {
    if (ownsConnection) await connection.beginTransaction();
    const [[user]] = await connection.query('SELECT wallet_balance FROM users WHERE id=? FOR UPDATE', [userId]);
    if (!user || Number(user.wallet_balance) < normalizedAmount) {
      const error = new Error('موجودی کیف پول برای انجام این عملیات کافی نیست.');
      error.status = 400;
      throw error;
    }
    await connection.query('UPDATE users SET wallet_balance=wallet_balance-? WHERE id=?', [normalizedAmount, userId]);
    const [result] = await connection.query(
      `INSERT INTO transactions(
        user_id,seller_id,product_id,package_id,type,amount,status,description,metadata
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        transaction.seller_id || null,
        transaction.product_id || null,
        transaction.package_id || null,
        transaction.type,
        normalizedAmount,
        'success',
        transaction.description,
        JSON.stringify(transaction.metadata || {}),
      ],
    );
    if (ownsConnection) await connection.commit();
    return result.insertId;
  } catch (error) {
    if (ownsConnection) await connection.rollback();
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

function normalizePackageFeatures(features) {
  if (Array.isArray(features)) {
    return features.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof features === 'string') {
    return features
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

async function getSetting(key, fallback = null) {
  const rows = await query('SELECT `value` FROM app_settings WHERE `key`=? LIMIT 1', [key]);
  return rows[0]?.value ?? fallback;
}

async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO app_settings(`key`,`value`) VALUES(?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
    [key, String(value ?? '')],
  );
  return { key, value: String(value ?? '') };
}

function packageRoleForUser(role) {
  return role === 'Seller' ? 'seller' : 'user';
}

async function getActiveProSubscription(userId, connection = pool) {
  const [[user]] = await connection.query('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
  const roleType = packageRoleForUser(user?.role);
  const [rows] = await connection.query(
    `SELECT ps.id, ps.package_id, ps.transaction_id, ps.starts_at, ps.expires_at,
            p.title, p.role_type, p.pro_requests_count, p.monthly_pro_request_limit
     FROM pro_subscriptions ps
     JOIN packages p ON p.id=ps.package_id
     WHERE ps.user_id=? AND ps.expires_at>NOW() AND p.role_type=? AND p.status='active'
     ORDER BY ps.expires_at DESC, ps.id DESC
     LIMIT 1`,
    [userId, roleType],
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    pro_requests_count: Number(rows[0].pro_requests_count || 0),
    monthly_pro_request_limit: Number(rows[0].monthly_pro_request_limit || 0),
  };
}

async function getProQuota(userId, ipAddress) {
  const [[user]] = await pool.query('SELECT role, pro_unlimited FROM users WHERE id=? LIMIT 1', [userId]);
  const hasUnlimitedAccess = hasUnlimitedProAccess(user);
  if (hasUnlimitedAccess) {
    return {
      free_limit: null,
      free_used: null,
      free_remaining: null,
      has_subscription: false,
      has_unlimited_access: true,
      subscription: null,
    };
  }

  const ip = String(ipAddress || `user:${userId}`).slice(0, 64);
  const subscription = await getActiveProSubscription(userId);
  const [[count]] = await pool.query(
    `SELECT COUNT(*) AS used
     FROM pro_usages
     WHERE ip_address=? AND is_free_trial=1 AND status='success'`,
    [ip],
  );
  const freeLimit = 3;
  const freeUsed = Number(count?.used || 0);
  return {
    free_limit: freeLimit,
    free_used: freeUsed,
    free_remaining: subscription ? null : Math.max(0, freeLimit - freeUsed),
    has_subscription: Boolean(subscription),
    has_unlimited_access: false,
    subscription,
  };
}

async function getPublicProQuota(ipAddress) {
  const ip = String(ipAddress || 'unknown').slice(0, 64);
  const [[count]] = await pool.query(
    `SELECT COUNT(*) AS used
     FROM pro_usages
     WHERE ip_address=? AND is_free_trial=1 AND status='success'`,
    [ip],
  );
  const freeLimit = 3;
  const freeUsed = Number(count?.used || 0);
  return {
    free_limit: freeLimit,
    free_used: freeUsed,
    free_remaining: Math.max(0, freeLimit - freeUsed),
    has_subscription: false,
    has_unlimited_access: false,
    subscription: null,
  };
}

async function activateProSubscription(userId, packageId, transactionId, providedConnection = null) {
  const connection = providedConnection || pool;
  const [[pack]] = await connection.query(
    `SELECT id, duration_days, role_type
     FROM packages
     WHERE id=? AND status='active'
     LIMIT 1`,
    [packageId],
  );
  if (!pack) return null;
  const [result] = await connection.query(
    `INSERT INTO pro_subscriptions(user_id,package_id,transaction_id,starts_at,expires_at)
     VALUES(?,?,?,NOW(),DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [userId, pack.id, transactionId || null, Math.max(1, Number(pack.duration_days || 30))],
  );
  return { id: result.insertId, package_id: Number(pack.id), role_type: pack.role_type, duration_days: Number(pack.duration_days || 30) };
}

async function getPackageById(id) {
  const rows = await query('SELECT * FROM packages WHERE id=? LIMIT 1', [id]);
  if (!rows[0]) {
    const error = new Error('package not found');
    error.status = 404;
    throw error;
  }
  return {
    ...rows[0],
    features: parseJson(rows[0].features, []),
    pro_requests_count: Number(rows[0].pro_requests_count || 0),
    monthly_pro_request_limit: Number(rows[0].monthly_pro_request_limit || 0),
  };
}

async function listPackages(roleType, options = {}) {
  const params = [];
  const where = [];

  if (roleType) {
    where.push('role_type=?');
    params.push(roleType);
  }

  if (!options.includeInactive) {
    where.push('status="active"');
  }

  const rows = await query(
    `SELECT * FROM packages ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY role_type ASC, id DESC`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    features: parseJson(row.features, []),
    pro_requests_count: Number(row.pro_requests_count || 0),
    monthly_pro_request_limit: Number(row.monthly_pro_request_limit || 0),
  }));
}

async function createPackage(payload) {
  const features = normalizePackageFeatures(payload.features);
  const [result] = await pool.query(
    `INSERT INTO packages(title,description,price,role_type,pro_requests_count,monthly_pro_request_limit,duration_days,features,status)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      payload.title,
      payload.description || '',
      toNumber(payload.price || 0),
      payload.role_type || 'user',
      toNumber(payload.pro_requests_count || 0),
      toNumber(payload.monthly_pro_request_limit || 0),
      toNumber(payload.duration_days || 30),
      JSON.stringify(features),
      payload.status || 'active',
    ],
  );

  return getPackageById(result.insertId);
}

async function updatePackage(id, payload) {
  const current = await getPackageById(id);
  const features = payload.features === undefined ? current.features : normalizePackageFeatures(payload.features);

  await pool.query(
    `UPDATE packages
     SET title=?, description=?, price=?, role_type=?, pro_requests_count=?, monthly_pro_request_limit=?, duration_days=?, features=?, status=?
     WHERE id=?`,
    [
      payload.title ?? current.title,
      payload.description ?? current.description,
      toNumber(payload.price ?? current.price ?? 0),
      payload.role_type ?? current.role_type,
      toNumber(payload.pro_requests_count ?? current.pro_requests_count ?? 0),
      toNumber(payload.monthly_pro_request_limit ?? current.monthly_pro_request_limit ?? 0),
      toNumber(payload.duration_days ?? current.duration_days ?? 30),
      JSON.stringify(features),
      payload.status ?? current.status,
      id,
    ],
  );

  return getPackageById(id);
}

async function purchasePackage(userId, packageId, roleType, payload = {}) {
  const rows = await query('SELECT * FROM packages WHERE id=? AND role_type=? AND status="active" LIMIT 1', [packageId, roleType]);
  const pack = rows[0];
  if (!pack) {
    const error = new Error('package not found');
    error.status = 404;
    throw error;
  }

  const paymentMethod = normalizePaymentMethod(payload.payment_method || 'wallet');
  const transaction = {
    seller_id: roleType === 'seller' ? userId : null,
    package_id: pack.id,
    type: roleType === 'seller' ? 'seller_package_purchase' : 'package_purchase',
    description: `خرید ${pack.title}`,
    metadata: { package_title: pack.title, role_type: roleType, duration_days: pack.duration_days, payment_method: paymentMethod },
  };

  let transactionId;
  let status = 'success';
  if (paymentMethod === 'bank_transfer') {
    transactionId = await createPendingPayment(userId, pack.price, {
      ...transaction,
      metadata: { ...transaction.metadata, receipt: payload.receipt || null, pending_action: 'package_purchase' },
    });
    status = 'pending';
  } else if (paymentMethod === 'direct_gateway') {
    transactionId = await createGatewayPayment(userId, pack.price, transaction);
  } else {
    transactionId = await spendWallet(userId, pack.price, transaction);
  }

  if (status === 'success') {
    await activateProSubscription(userId, pack.id, transactionId);
  }

  await createNotification(
    userId,
    status === 'pending' ? 'درخواست خرید پکیج ثبت شد' : 'خرید پکیج ثبت شد',
    status === 'pending'
      ? `درخواست خرید پکیج «${pack.title}» ثبت شد و بعد از تایید رسید تکمیل می‌شود.`
      : `پکیج «${pack.title}» با موفقیت خریداری شد.`,
    'package_purchase',
    transactionId,
  );

  return { ...pack, features: parseJson(pack.features, []), transaction_id: transactionId, status, amount: Number(pack.price) };
}

async function purchaseTokens(userId, roleType, payload = {}) {
  const tokenPrice = Number(await getSetting('token_price', 25000) || 25000);
  const quantity = toNumber(payload.quantity || 0);

  if (!quantity || quantity < 1) {
    const error = new Error('token quantity invalid');
    error.status = 400;
    throw error;
  }

  const total = quantity * tokenPrice;
  const paymentMethod = normalizePaymentMethod(payload.payment_method || 'wallet');
  const transaction = {
    seller_id: roleType === 'seller' ? userId : null,
    type: roleType === 'seller' ? 'seller_package_purchase' : 'package_purchase',
    description: `خرید ${quantity} توکن`,
    metadata: {
      token_purchase: true,
      token_quantity: quantity,
      token_unit_price: tokenPrice,
      role_type: roleType,
      payment_method: paymentMethod,
    },
  };

  let transactionId;
  let status = 'success';
  if (paymentMethod === 'bank_transfer') {
    transactionId = await createPendingPayment(userId, total, {
      ...transaction,
      metadata: { ...transaction.metadata, receipt: payload.receipt || null, pending_action: 'token_purchase' },
    });
    status = 'pending';
  } else if (paymentMethod === 'direct_gateway') {
    transactionId = await createGatewayPayment(userId, total, transaction);
  } else {
    transactionId = await spendWallet(userId, total, transaction);
  }

  await createNotification(
    userId,
    status === 'pending' ? 'درخواست خرید توکن ثبت شد' : 'خرید توکن ثبت شد',
    status === 'pending'
      ? `درخواست خرید ${quantity.toLocaleString('fa-IR')} توکن ثبت شد و بعد از تایید رسید تکمیل می‌شود.`
      : `${quantity.toLocaleString('fa-IR')} توکن با مبلغ ${(total || 0).toLocaleString('fa-IR')} تومان با موفقیت خریداری شد.`,
    'token_purchase',
    transactionId,
  );

  return { quantity, token_price: tokenPrice, total, transaction_id: transactionId, status, amount: total };
}

async function listPendingPayments({ page, limit, includeMeta = false } = {}) {
  const pagination = normalizePagination(page, limit, 25);
  const rows = await query(
    `SELECT
       t.id, t.user_id, t.seller_id, t.product_id, t.package_id, t.type,
       t.amount, t.status, t.description, t.metadata, t.created_at,
       u.fullname AS user_name, u.email AS user_email, u.mobile AS user_mobile, u.role AS user_role
     FROM transactions t
     JOIN users u ON u.id=t.user_id
     WHERE t.status='pending'
     ORDER BY t.id DESC
     LIMIT ? OFFSET ?`,
    [pagination.limit, pagination.offset],
  );
  const items = rows.map((row) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
  if (!includeMeta) return items;
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM transactions WHERE status="pending"');
  return { items, pagination: paginationMeta(pagination.page, pagination.limit, count.total) };
}

async function approvePendingPayment(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[transaction]] = await connection.query('SELECT * FROM transactions WHERE id=? AND status="pending" FOR UPDATE', [id]);
    if (!transaction) {
      const error = new Error('pending payment not found');
      error.status = 404;
      throw error;
    }

    const metadata = parseJson(transaction.metadata, {});
    if (transaction.type === 'wallet_charge') {
      await connection.query('UPDATE users SET wallet_balance=wallet_balance+? WHERE id=?', [Number(transaction.amount), transaction.user_id]);
    }

    if (metadata.pending_action === 'package_purchase' && transaction.package_id) {
      await activateProSubscription(transaction.user_id, transaction.package_id, transaction.id, connection);
    }

    await connection.query('UPDATE transactions SET status="success" WHERE id=?', [id]);
    await connection.commit();

    await createNotification(
      transaction.user_id,
      'پرداخت تایید شد',
      metadata.pending_action === 'wallet_charge'
        ? 'رسید شارژ کیف پول تایید شد و مبلغ به کیف پول اضافه شد.'
        : 'رسید پرداخت شما توسط ادمین تایید شد.',
      'payment_approved',
      id,
    );

    return { id: toNumber(id), status: 'success' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectPendingPayment(id, reason = 'رسید پرداخت تایید نشد.') {
  const [result] = await pool.query('UPDATE transactions SET status="failed", metadata=JSON_SET(COALESCE(metadata, JSON_OBJECT()), "$.reject_reason", ?) WHERE id=? AND status="pending"', [reason, id]);
  if (!result.affectedRows) {
    const error = new Error('pending payment not found');
    error.status = 404;
    throw error;
  }
  return { id: toNumber(id), status: 'failed', reason };
}

const MAX_PRO_UPLOAD_DATA_LENGTH = 9 * 1024 * 1024;

function normalizeProUploadImage(image) {
  const value = String(image || '').trim();
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) {
    const error = new Error('تصویر کاربر معتبر نیست. لطفاً یک فایل تصویری انتخاب کنید.');
    error.status = 400;
    throw error;
  }
  if (value.length > MAX_PRO_UPLOAD_DATA_LENGTH) {
    const error = new Error('حجم تصویر کاربر بیش از حد مجاز است.');
    error.status = 413;
    throw error;
  }
  return value;
}

async function createProUpload(payload = {}) {
  const image = normalizeProUploadImage(payload.image);
  const product = payload.product_id ? await getProduct(payload.product_id) : null;
  if (!product || product.status !== 'active' || product.publish_status !== 'active') {
    const error = new Error('محصول برای پرو آنلاین فعال نیست.');
    error.status = 404;
    throw error;
  }

  const userId = payload.user_id == null ? null : toNumber(payload.user_id);
  if (payload.user_id != null && !userId) {
    const error = new Error('حساب کاربری برای بارگذاری تصویر معتبر نیست.');
    error.status = 400;
    throw error;
  }
  const ipAddress = String(payload.ip_address || '').slice(0, 64) || null;
  const fileName = String(payload.file_name || 'person.jpg').trim().slice(0, 180) || 'person.jpg';
  const [result] = await pool.query(
    `INSERT INTO pro_uploads(user_id,product_id,ip_address,file_name,image,status)
     VALUES(?,?,?,?,?,'uploaded')`,
    [userId, product.id, ipAddress, fileName, image],
  );
  return { id: result.insertId, product_id: product.id, status: 'uploaded' };
}

async function markProUploadUsed(connection, uploadId, { userId = null, ipAddress = null } = {}) {
  if (uploadId == null || uploadId === '') return;
  const id = toNumber(uploadId);
  if (!id) {
    const error = new Error('شناسه تصویر بارگذاری‌شده معتبر نیست.');
    error.status = 400;
    throw error;
  }

  let sql = `UPDATE pro_uploads
             SET status='used', used_at=NOW()
             WHERE id=? AND status='uploaded'`;
  const params = [id];
  if (userId != null) {
    sql += ' AND user_id=?';
    params.push(userId);
  } else {
    sql += ' AND user_id IS NULL AND ip_address=?';
    params.push(String(ipAddress || '').slice(0, 64));
  }

  const [result] = await connection.query(sql, params);
  if (!result.affectedRows) {
    const error = new Error('تصویر بارگذاری‌شده برای این درخواست معتبر نیست.');
    error.status = 409;
    throw error;
  }
}

async function createProUsage(userId, payload) {
  const amount = toNumber(payload.amount || 0);
  const transactionId = await spendWallet(userId, amount, {
    seller_id: payload.seller_id || null,
    package_id: payload.package_id || null,
    type: 'pro_usage',
    description: payload.description || 'استفاده از سرویس پرو',
    metadata: { package_id: payload.package_id || null, service: 'pro_usage' },
  });
  const [result] = await pool.query(
    'INSERT INTO pro_usages(user_id,package_id,amount,status,description) VALUES(?,?,?,?,?)',
    [userId, payload.package_id || null, amount, 'success', payload.description || 'استفاده از سرویس پرو'],
  );
  return { id: result.insertId, transaction_id: transactionId };
}

async function createProUsageEnhanced(userId, payload) {
  const amount = toNumber(payload.amount || 0);
  const product = payload.product_id ? await getProduct(payload.product_id) : null;
  const description = payload.description || (product ? `پرو آنلاین برای محصول «${product.title}»` : 'استفاده از سرویس پرو');
  const ipAddress = String(payload.client_ip || `user:${userId}`).slice(0, 64);
  const quota = await getProQuota(userId, ipAddress);
  if (!quota.has_subscription && !quota.has_unlimited_access && quota.free_remaining <= 0) {
    const error = new Error('سه تجربه رایگان پرو آنلاین شما استفاده شده است. برای ادامه یک اشتراک فعال کنید.');
    error.status = 402;
    error.code = 'PRO_SUBSCRIPTION_REQUIRED';
    throw error;
  }
  const isFreeTrial = quota.has_subscription || quota.has_unlimited_access ? 0 : 1;
  const packageId = payload.package_id || quota.subscription?.package_id || null;
  const connection = await pool.getConnection();
  let transactionId;
  let result;
  try {
    await connection.beginTransaction();
    transactionId = await spendWallet(userId, amount, {
      seller_id: payload.seller_id || product?.seller_id || null,
      product_id: product?.id || null,
      package_id: packageId,
      type: 'pro_usage',
      description,
      metadata: {
        package_id: packageId,
        product_id: product?.id || null,
        product_title: product?.title || '',
        service: 'pro_usage',
        ip_address: ipAddress,
        is_free_trial: Boolean(isFreeTrial),
      },
    }, connection);
    const [inserted] = await connection.query(
      `INSERT INTO pro_usages(
        user_id,package_id,product_id,amount,status,description,input_image,product_image,output_image,ip_address,is_free_trial
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        packageId,
        product?.id || payload.product_id || null,
        amount,
        'success',
        description,
        payload.input_image || null,
        payload.product_image || product?.images?.[0] || null,
        payload.output_image || null,
        ipAddress,
        isFreeTrial,
      ],
    );
    result = inserted;
    await markProUploadUsed(connection, payload.upload_id, { userId, ipAddress });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (product?.seller_id) {
    await createNotification(
      product.seller_id,
      'درخواست پرو آنلاین جدید',
      `برای محصول «${product.title}» یک درخواست پرو آنلاین ثبت شد.`,
      'pro_usage',
      result.insertId,
    );
  }
  return {
    id: result.insertId,
    transaction_id: transactionId,
    product_id: product?.id || payload.product_id || null,
    output_image: payload.output_image || null,
    free_limit: quota.free_limit,
    free_used: quota.free_used == null ? null : quota.free_used + (isFreeTrial ? 1 : 0),
    free_remaining: quota.has_subscription || quota.has_unlimited_access ? null : Math.max(0, quota.free_remaining - 1),
    has_subscription: quota.has_subscription,
    has_unlimited_access: quota.has_unlimited_access,
  };
}

async function createPublicProUsage(payload) {
  const ipAddress = String(payload.client_ip || 'unknown').slice(0, 64);
  const product = payload.product_id ? await getProduct(payload.product_id) : null;
  if (!product || product.status !== 'active' || product.publish_status !== 'active') {
    const error = new Error('محصول برای پرو آنلاین فعال نیست.');
    error.status = 404;
    throw error;
  }

  const quota = await getPublicProQuota(ipAddress);
  if (quota.free_remaining <= 0) {
    const error = new Error('سه تجربه رایگان پرو آنلاین شما استفاده شده است. برای ادامه وارد حساب شوید و اشتراک بخرید.');
    error.status = 402;
    error.code = 'PRO_SUBSCRIPTION_REQUIRED';
    throw error;
  }

  const description = payload.description || `پرو آنلاین برای محصول «${product.title}»`;
  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    const [inserted] = await connection.query(
      `INSERT INTO pro_usages(
        user_id,package_id,product_id,amount,status,description,input_image,product_image,output_image,ip_address,is_free_trial
      ) VALUES(NULL,NULL,?,?,?,?,?,?,?,?,1)`,
      [
        product.id,
        toNumber(payload.amount || 0),
        'success',
        description,
        payload.input_image || null,
        payload.product_image || product.images?.[0] || null,
        payload.output_image || null,
        ipAddress,
      ],
    );
    result = inserted;
    await markProUploadUsed(connection, payload.upload_id, { ipAddress });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (product.seller_id) {
    await createNotification(
      product.seller_id,
      'درخواست پرو آنلاین جدید',
      `برای محصول «${product.title}» یک درخواست پرو آنلاین عمومی ثبت شد.`,
      'pro_usage',
      result.insertId,
    );
  }

  return {
    id: result.insertId,
    product_id: product.id,
    output_image: payload.output_image || null,
    free_limit: quota.free_limit,
    free_used: quota.free_used + 1,
    free_remaining: Math.max(0, quota.free_remaining - 1),
    has_subscription: false,
  };
}

async function listProUsages(userId, productId = null) {
  const params = [userId];
  let where = 'pu.user_id=?';
  if (productId) {
    where += ' AND pu.product_id=?';
    params.push(productId);
  }
  return query(
    `SELECT pu.*, p.title AS product_title, p.images AS product_images, s.store_name, seller.fullname AS seller_name
     FROM pro_usages pu
     LEFT JOIN products p ON p.id=pu.product_id
     LEFT JOIN stores s ON s.seller_id=p.seller_id
     LEFT JOIN users seller ON seller.id=p.seller_id
     WHERE ${where}
     ORDER BY pu.id DESC`,
    params,
  ).then((rows) => rows.map((row) => ({
    ...row,
    product_images: parseJson(row.product_images, []),
  })));
}

async function listPublicProUsages(ipAddress, productId = null) {
  const params = [String(ipAddress || 'unknown').slice(0, 64)];
  let where = 'pu.ip_address=? AND pu.user_id IS NULL AND pu.is_free_trial=1 AND pu.status="success"';
  if (productId) {
    where += ' AND pu.product_id=?';
    params.push(productId);
  }
  return query(
    `SELECT pu.id, pu.product_id, pu.description, pu.input_image, pu.product_image, pu.output_image,
            pu.is_free_trial, pu.created_at, p.title AS product_title
     FROM pro_usages pu
     LEFT JOIN products p ON p.id=pu.product_id
     WHERE ${where}
     ORDER BY pu.id DESC
     LIMIT 20`,
    params,
  );
}

async function getStoreBySeller(sellerId) {
  const rows = await query('SELECT * FROM stores WHERE seller_id=? LIMIT 1', [sellerId]);
  return canonicalStoreSlug(rows[0] || null);
}

async function getStoreBySlug(slug) {
  const value = String(slug || '').trim();
  const rows = await query('SELECT * FROM stores WHERE (slug=? OR legacy_slug=?) AND status="active" LIMIT 1', [value, value]);
  if (rows[0]) return canonicalStoreSlug(rows[0]);

  let legacySlug = value;
  try {
    legacySlug = decodeURIComponent(value);
  } catch {
    // Keep the original route value when it is not a valid encoded segment.
  }
  const legacyUsername = legacySlug.replace(/-seller$/u, '');
  if (!/^\d{6,}$/u.test(legacyUsername)) return null;
  const legacyRows = await query(
    `SELECT s.*
     FROM stores s
     JOIN users u ON u.id=s.seller_id
     WHERE s.status="active" AND (u.username=? OR u.mobile=? OR u.mobile=? OR u.mobile=?)
     ORDER BY CASE WHEN u.username=? THEN 0 ELSE 1 END, s.id DESC
     LIMIT 1`,
    [legacyUsername, legacyUsername, `+98${legacyUsername.slice(1)}`, `0098${legacyUsername.slice(1)}`, legacyUsername],
  );
  return canonicalStoreSlug(legacyRows[0] || null);
}

async function updateStore(sellerId, payload) {
  const current = await getStoreBySeller(sellerId);
  const submittedContactPhone = payload.contact_phone !== undefined ? payload.contact_phone : payload.phone;
  if (!current) {
    const storeName = payload.store_name || payload.name || 'فروشگاه من';
    const slug = await uniqueStoreSlug(pool, storeName, sellerId);
    const contactPhone = submittedContactPhone === undefined ? null : normalizeContactPhone(submittedContactPhone);
    await pool.query(
      'INSERT INTO stores(seller_id,store_name,slug,description,contact_phone,logo,banner,qr_code,status) VALUES(?,?,?,?,?,?,?,?,?)',
      [sellerId, storeName, slug, payload.description || '', contactPhone, payload.logo || null, payload.banner || null, null, 'active'],
    );
  } else {
    const storeName = payload.store_name || payload.name || current.store_name || 'فروشگاه من';
    const nextSlug = await uniqueStoreSlug(pool, storeName, sellerId, current.slug);
    const contactPhone = submittedContactPhone === undefined
      ? (current.contact_phone || null)
      : normalizeContactPhone(submittedContactPhone);
    await pool.query(
      `UPDATE stores
       SET store_name=?, slug=?, description=?, contact_phone=?, logo=?, banner=?, qr_code=?, status=?
       WHERE seller_id=?`,
      [
        storeName,
        nextSlug,
        payload.description ?? current.description,
        contactPhone,
        payload.logo ?? current.logo,
        payload.banner ?? current.banner,
        nextSlug !== current.slug ? null : (payload.qr_code ?? current.qr_code),
        payload.status || current.status,
        sellerId,
      ],
    );
  }
  return getStoreBySeller(sellerId);
}

async function saveStoreQrCode(sellerId, qrcode) {
  await pool.query('UPDATE stores SET qr_code=? WHERE seller_id=?', [qrcode, sellerId]);
  return getStoreBySeller(sellerId);
}

async function saveProductQrCode(productId, qrcode) {
  await pool.query('UPDATE products SET qr_code=? WHERE id=?', [qrcode, productId]);
  return getProduct(productId);
}

async function listTickets({
  userId,
  userRole,
  page,
  limit,
  includeMeta = false,
  includeMessages = false,
} = {}) {
  const params = [];
  const where = [];
  if (userId) {
    where.push('t.user_id=?');
    params.push(userId);
  }
  if (userRole) {
    where.push('u.role=?');
    params.push(roleValue(userRole));
  }
  const paginated = includeMeta || page != null || limit != null;
  const pagination = paginated ? normalizePagination(page, limit, 25) : null;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const tickets = await query(
    `SELECT
       t.id, t.user_id, t.title, t.priority, t.status, t.created_at, t.updated_at,
       u.fullname AS user_name, u.role AS user_role,
       (SELECT COUNT(*) FROM ticket_messages tm_count WHERE tm_count.ticket_id=t.id) AS replies,
       EXISTS(SELECT 1 FROM ticket_messages tm_attachment WHERE tm_attachment.ticket_id=t.id AND tm_attachment.attachment IS NOT NULL AND tm_attachment.attachment<>"") AS has_attachment
     FROM tickets t
     JOIN users u ON u.id=t.user_id
     ${whereSql}
     ORDER BY t.id DESC
     ${paginated ? 'LIMIT ? OFFSET ?' : ''}`,
    paginated ? [...params, pagination.limit, pagination.offset] : params,
  );
  const items = includeMessages
    ? await Promise.all(tickets.map(async (ticket) => ({ ...ticket, messages: await ticketMessages(ticket.id) })))
    : tickets;
  if (!includeMeta) return items;

  const [[count]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM tickets t
     JOIN users u ON u.id=t.user_id
     ${whereSql}`,
    params,
  );
  return { items, pagination: paginationMeta(pagination.page, pagination.limit, count.total) };
}

async function ticketMessages(ticketId) {
  return query(
    `SELECT tm.*, u.fullname AS sender_name, u.role AS sender_role
     FROM ticket_messages tm
     JOIN users u ON u.id=tm.sender_id
     WHERE tm.ticket_id=?
     ORDER BY tm.id ASC`,
    [ticketId],
  );
}

async function getTicket(id) {
  const rows = await query('SELECT * FROM tickets WHERE id=? LIMIT 1', [id]);
  if (!rows[0]) return null;
  return { ...rows[0], messages: await ticketMessages(id) };
}

async function createTicket(userId, payload) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      'INSERT INTO tickets(user_id,title,priority,status) VALUES(?,?,?,?)',
      [userId, payload.title || payload.subject, payload.priority || 'medium', 'open'],
    );
    await connection.query(
      'INSERT INTO ticket_messages(ticket_id,sender_id,message,attachment) VALUES(?,?,?,?)',
      [result.insertId, userId, payload.message || payload.title || payload.subject, payload.attachment || null],
    );

    const user = await rawUserById(userId, connection);
    await notifyAdmins(
      'تیکت جدید دریافت شد',
      `تیکت جدیدی با موضوع «${payload.title || payload.subject}» از ${user?.fullname || 'کاربر'} ثبت شد.`,
      'ticket',
      result.insertId,
      connection,
    );

    await connection.commit();
    return getTicket(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function replyTicket(ticketId, senderId, payload) {
  const ticket = await getTicket(ticketId);
  if (!ticket) {
    const error = new Error('ticket not found');
    error.status = 404;
    throw error;
  }
  if (ticket.status === 'closed') {
    const error = new Error('ticket is closed');
    error.status = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO ticket_messages(ticket_id,sender_id,message,attachment) VALUES(?,?,?,?)',
      [ticketId, senderId, payload.message, payload.attachment || null],
    );
    const sender = await rawUserById(senderId, connection);
    const nextStatus = sender?.role === 'Admin' ? 'answered' : 'open';
    await connection.query('UPDATE tickets SET status=? WHERE id=?', [nextStatus, ticketId]);

    if (sender?.role === 'Admin') {
      await createNotification(ticket.user_id, `پاسخ جدید برای تیکت #${ticketId}`, payload.message, 'ticket', ticketId, connection);
    } else {
      const title = `پیام جدید در تیکت #${ticketId}`;
      const body = `${sender?.fullname || 'کاربر'} برای تیکت «${ticket.title}» پاسخ جدید ثبت کرد.`;
      await notifyAdmins(title, body, 'ticket', ticketId, connection);
    }

    await connection.commit();
    return getTicket(ticketId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function closeTicket(ticketId) {
  await pool.query('UPDATE tickets SET status="closed" WHERE id=?', [ticketId]);
  return getTicket(ticketId);
}

async function createReview(userId, productId, payload) {
  const product = await getProduct(productId);
  if (!product) {
    const error = new Error('product not found');
    error.status = 404;
    throw error;
  }

  const purchases = await query(
    `SELECT id
     FROM transactions
     WHERE user_id=? AND product_id=? AND type='product_purchase' AND status='success'
     LIMIT 1`,
    [userId, productId],
  );
  if (!purchases[0]) {
    const error = new Error('purchase required');
    error.status = 400;
    throw error;
  }

  const rating = toNumber(payload.rating || 0);
  if (rating < 1 || rating > 5) {
    const error = new Error('rating invalid');
    error.status = 400;
    throw error;
  }

  await pool.query(
    `INSERT INTO reviews(product_id,user_id,seller_id,rating,comment)
     VALUES(?,?,?,?,?)
     ON DUPLICATE KEY UPDATE rating=VALUES(rating), comment=VALUES(comment), updated_at=CURRENT_TIMESTAMP`,
    [productId, userId, product.seller_id, rating, payload.comment || ''],
  );

  const user = await findUserById(userId);
  await createNotification(
    product.seller_id,
    'نظر جدید برای محصول',
    `${user?.fullname || 'کاربر'} برای محصول «${product.title}» امتیاز ${rating} ثبت کرد.`,
    'review',
    productId,
  );

  return getProduct(productId);
}

async function dashboardFor(role, id) {
  if (role === 'Admin') {
    const [[users], [sellers], [pendingSellers], [pendingProducts], [activeProducts], [companyIncome], [openTickets]] = await Promise.all([
      query('SELECT COUNT(*) value FROM users WHERE role="User"'),
      query('SELECT COUNT(*) value FROM users WHERE role="Seller"'),
      query('SELECT COUNT(*) value FROM users WHERE role="Seller" AND seller_verification_status="pending"'),
      query('SELECT COUNT(*) value FROM products WHERE status="pending" OR pending_changes IS NOT NULL'),
      query('SELECT COUNT(*) value FROM products WHERE status="active"'),
      query('SELECT COALESCE(SUM(amount),0) value FROM transactions WHERE type="company_income" AND status="success"'),
      query('SELECT COUNT(*) value FROM tickets WHERE status="open"'),
    ]);
    return {
      total_users: users.value,
      total_sellers: sellers.value,
      pending_sellers: pendingSellers.value,
      pending_products: pendingProducts.value,
      active_products: activeProducts.value,
      company_income: Number(companyIncome.value),
      open_tickets: openTickets.value,
      charts: await monthlyChart(),
    };
  }

  if (role === 'Seller') {
    const [[active], [pending], [rejected], [customers], [sales], [wallet], packages] = await Promise.all([
      query('SELECT COUNT(*) value FROM products WHERE seller_id=? AND status="active"', [id]),
      query('SELECT COUNT(*) value FROM products WHERE seller_id=? AND (status="pending" OR pending_changes IS NOT NULL)', [id]),
      query('SELECT COUNT(*) value FROM products WHERE seller_id=? AND status="rejected"', [id]),
      query('SELECT COUNT(*) value FROM seller_customers WHERE seller_id=?', [id]),
      query('SELECT COALESCE(SUM(amount),0) value FROM transactions WHERE seller_id=? AND status="success"', [id]),
      query('SELECT wallet_balance value FROM users WHERE id=?', [id]),
      listPackages('seller'),
    ]);
    return {
      active_products: active.value,
      pending_products: pending.value,
      rejected_products: rejected.value,
      customers: customers.value,
      sales_total: Number(sales.value),
      wallet_balance: Number(wallet.value),
      active_package: packages[0] || null,
      charts: await monthlyChart(id),
    };
  }

  const [[wallet], [financial], [pro], [tickets]] = await Promise.all([
    query('SELECT wallet_balance value FROM users WHERE id=?', [id]),
    query('SELECT COUNT(*) value FROM transactions WHERE user_id=? AND type!="pro_usage"', [id]),
    query('SELECT COUNT(*) value FROM pro_usages WHERE user_id=?', [id]),
    query('SELECT COUNT(*) value FROM tickets WHERE user_id=?', [id]),
  ]);
  return {
    wallet_balance: Number(wallet.value),
    financial_transactions: financial.value,
    pro_usages: pro.value,
    tickets: tickets.value,
    charts: await userMonthlyChart(id),
  };
}

async function monthlyChart(sellerId) {
  const where = sellerId ? 'WHERE seller_id=?' : '';
  const params = sellerId ? [sellerId] : [];
  return query(
    `SELECT DATE_FORMAT(created_at,'%Y-%m') name, COALESCE(SUM(amount),0) sales, COUNT(*) orders
     FROM transactions
     ${where}
     GROUP BY DATE_FORMAT(created_at,'%Y-%m')
     ORDER BY name ASC
     LIMIT 12`,
    params,
  );
}

async function userMonthlyChart(userId) {
  return query(
    `SELECT DATE_FORMAT(created_at,'%Y-%m') name, COALESCE(SUM(amount),0) amount, COUNT(*) orders
     FROM transactions
     WHERE user_id=?
     GROUP BY DATE_FORMAT(created_at,'%Y-%m')
     ORDER BY name ASC
     LIMIT 12`,
    [userId],
  );
}

module.exports = {
  bcrypt,
  normalizePagination,
  paginationMeta,
  safeUser,
  isUnlimitedProMobile,
  hasUnlimitedProAccess,
  normalizeImages,
  normalizeProductFeatures,
  findUserByUsername,
  findUserByMobileAndRole,
  findUserById,
  listUsers,
  createUser,
  updateAdminUser,
  setUserStatus,
  deleteUser,
  setSellerVerification,
  updateUserProfile,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  setProductPublishStatus,
  setProductStatus,
  purchaseProduct,
  listCustomers,
  listTransactions,
  chargeWallet,
  listPackages,
  createPackage,
  updatePackage,
  purchasePackage,
  purchaseTokens,
  listPendingPayments,
  approvePendingPayment,
  rejectPendingPayment,
  getSetting,
  setSetting,
  getProQuota,
  getPublicProQuota,
  createProUpload,
  activateProSubscription,
  createProUsage: createProUsageEnhanced,
  createPublicProUsage,
  listProUsages,
  listPublicProUsages,
  getStoreBySeller,
  getStoreBySlug,
  updateStore,
  saveStoreQrCode,
  saveProductQrCode,
  listTickets,
  getTicket,
  createTicket,
  replyTicket,
  closeTicket,
  createReview,
  createNotification,
  notifyAdmins,
  listNotifications,
  markNotificationsRead,
  dashboardFor,
};
