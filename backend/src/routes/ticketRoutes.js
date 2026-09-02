const router = require('express').Router();
const controller = require('../controllers/ticketController');
const { authenticate } = require('../middlewares/authMiddleware');

router.use(authenticate);
router.post('/', controller.create);
router.get('/faqs', controller.faqs);
router.get('/my', controller.my);
router.get('/:id', controller.get);
router.post('/:id/reply', controller.reply);
router.patch('/:id/close', controller.close);

module.exports = router;
