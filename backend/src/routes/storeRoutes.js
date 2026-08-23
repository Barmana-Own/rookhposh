const router = require('express').Router();
const controller = require('../controllers/storeController');

router.get('/:slug/products/:productId/pro/quota', controller.publicProQuota);
router.get('/:slug/products/:productId/pro/history', controller.publicProHistory);
router.post('/:slug/products/:productId/pro/upload', controller.publicUploadProImage);
router.post('/:slug/products/:productId/pro/use', controller.publicUsePro);
router.get('/:slug', controller.publicStore);

module.exports = router;
