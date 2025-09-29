require('dotenv').config();
const express = require('express');
const mariadb = require('mariadb');
const { body, param, validationResult } = require('express-validator');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json()); // parse JSON bodies

const PORT = process.env.PORT || 3000;

/** DB pool **/
const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'sample',
  connectionLimit: 5,
});

/** helpers **/
const titleCase = (s='') => s.toString()
  .trim()
  .toLowerCase()
  .replace(/\b[a-z]/g, c => c.toUpperCase());

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });
  next();
};

/** GETs already required */
app.get('/health', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const r = await c.query('SELECT 1 AS ok'); c.release();
    res.json({ status: 'ok', db: r[0].ok === 1 });
  } catch { res.status(500).json({ status: 'error', db: false }); }
});

app.get('/customers', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const rows = await c.query('SELECT * FROM customer LIMIT 50');
    c.release();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/orders', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const rows = await c.query('SELECT * FROM orders LIMIT 50');
    c.release();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/products', async (_req, res) => {
  try {
    const c = await pool.getConnection();
    const rows = await c.query('SELECT * FROM foods LIMIT 50'); // alias to “products”
    c.release();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** ---------- CRUD on /customers (table: customer) ---------- **/

// POST /customers  (create)
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

// PATCH /customers/:id  (partial update)
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
      if (req.body.cust_name !== undefined) {
        fields.push('cust_name=?');
        params.push(titleCase(req.body.cust_name));
      }
      if (req.body.cust_city !== undefined) {
        fields.push('cust_city=?');
        params.push(titleCase(req.body.cust_city));
      }
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

// PUT /customers/:id  (replace)
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

// DELETE /customers/:id
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

/** ---------- Swagger ---------- **/
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'REST-like Sample API', version: '1.0.0' },
    servers: [{ url: `http://YOUR_IP:${PORT}` }],
  },
  apis: [],
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => console.log(`API listening on http://0.0.0.0:${PORT}`));
