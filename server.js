require('dotenv').config();
const express = require('express');
const mariadb = require('mariadb');
const { body, param, validationResult } = require('express-validator');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

/** DB pool **/
const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'root',
  database: process.env.DB_NAME || 'sample',
  connectionLimit: 5,
});

/** helpers **/
const titleCase = (s='') => s.toString().trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

/**
 * @swagger
 * tags:
 *   - name: Health
 *   - name: Customers
 *   - name: Orders
 *   - name: Products
 */

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness + DB check
 *     responses:
 *       200:
 *         description: Server OK
 */
app.get('/health', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const r = await c.query('SELECT 1 AS ok'); c.release();
    res.json({ status: 'ok', db: r[0].ok === 1 });
  } catch { res.status(500).json({ status: 'error', db: false }); }
});

/**
 * @swagger
 * /customers:
 *   get:
 *     tags: [Customers]
 *     summary: List customers
 *     responses:
 *       200:
 *         description: Array of customers
 */
app.get('/customers', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const rows = await c.query('SELECT * FROM customer LIMIT 50');
    c.release();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: List orders
 *     responses:
 *       200:
 *         description: Array of orders
 */
app.get('/orders', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const rows = await c.query('SELECT * FROM orders LIMIT 50');
    c.release();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products (mapped to foods table)
 *     responses:
 *       200:
 *         description: Array of products
 */
app.get('/products', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const rows = await c.query('SELECT * FROM foods LIMIT 50');
    c.release();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * @swagger
 * /customers:
 *   post:
 *     tags: [Customers]
 *     summary: Create a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cust_code, cust_name]
 *             properties:
 *               cust_code: { type: string }
 *               cust_name: { type: string }
 *               cust_city: { type: string }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Bad request }
 */
app.post(
  '/customers',
  body('cust_code').trim().isLength({ min: 1 }).withMessage('cust_code required'),
  body('cust_name').trim().isLength({ min: 1 }).withMessage('cust_name required'),
  body('cust_city').optional().trim().escape(),
  handleValidation,
  async (req, res) => {
    const payload = {
      cust_code: req.body.cust_code.trim(),
      cust_name: titleCase(req.body.cust_name),
      cust_city: req.body.cust_city ? titleCase(req.body.cust_city) : null,
    };
    try {
      const c = await pool.getConnection();
      await c.query(
        'INSERT INTO customer (cust_code, cust_name, cust_city) VALUES (?, ?, ?)',
        [payload.cust_code, payload.cust_name, payload.cust_city]
      );
      c.release();
      res.status(201).json({ message: 'Customer created', customer: payload });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

/**
 * @swagger
 * /customers/{id}:
 *   patch:
 *     tags: [Customers]
 *     summary: Partially update a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cust_name: { type: string }
 *               cust_city: { type: string }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 */
app.patch(
  '/customers/:id',
  param('id').trim().notEmpty(),
  body('cust_name').optional().trim(),
  body('cust_city').optional().trim(),
  handleValidation,
  async (req, res) => {
    try {
      const fields = [];
      const params = [];
      if (req.body.cust_name !== undefined) { fields.push('cust_name=?'); params.push(titleCase(req.body.cust_name)); }
      if (req.body.cust_city !== undefined) { fields.push('cust_city=?'); params.push(titleCase(req.body.cust_city)); }
      if (fields.length === 0) return res.status(400).json({ error: 'No updatable fields' });
      params.push(req.params.id);
      const c = await pool.getConnection();
      const r = await c.query(`UPDATE customer SET ${fields.join(', ')} WHERE cust_code=?`, params);
      c.release();
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
      res.json({ message: 'Customer updated' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

/**
 * @swagger
 * /customers/{id}:
 *   put:
 *     tags: [Customers]
 *     summary: Replace a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cust_name]
 *             properties:
 *               cust_name: { type: string }
 *               cust_city: { type: string }
 *     responses:
 *       200: { description: Replaced }
 *       404: { description: Not found }
 */
app.put(
  '/customers/:id',
  param('id').trim().notEmpty(),
  body('cust_name').trim().notEmpty(),
  body('cust_city').optional().trim(),
  handleValidation,
  async (req, res) => {
    try {
      const c = await pool.getConnection();
      const r = await c.query(
        'UPDATE customer SET cust_name=?, cust_city=? WHERE cust_code=?',
        [titleCase(req.body.cust_name), req.body.cust_city ? titleCase(req.body.cust_city) : null, req.params.id]
      );
      c.release();
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
      res.json({ message: 'Customer replaced' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     tags: [Customers]
 *     summary: Delete a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
app.delete(
  '/customers/:id',
  param('id').trim().notEmpty(),
  handleValidation,
  async (req, res) => {
    try {
      const c = await pool.getConnection();
      const r = await c.query('DELETE FROM customer WHERE cust_code=?', [req.params.id]);
      c.release();
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });
      res.json({ message: 'Customer deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

/**
 * @swagger
 * /say:
 *   get:
 *     summary: Returns a message using your Function
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         required: true
 *         description: A keyword to include in the message
 *     responses:
 *       200:
 *         description: Message from Serina
 */

const axios = require('axios'); // make sure axios is installed

app.get('/say', async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: "Missing 'keyword' parameter" });

  try {
    // call your function hosted online (or locally for now)
    const response = await axios.get(`https://YOUR_FUNCTION_URL?keyword=${encodeURIComponent(keyword)}`);
    res.json({ message: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/** ---------- Swagger bootstrapping ---------- **/
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'REST-like Sample API', version: '1.0.0' },
    servers: [{ url: `http://167.71.182.41:${PORT}` }], // your droplet IP
  },
  apis: ['./server.js'], // <— tell swagger-jsdoc to scan this file
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => console.log(`API listening on http://0.0.0.0:${PORT}`));
