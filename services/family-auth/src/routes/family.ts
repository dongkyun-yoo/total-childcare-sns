import { Router } from 'express';
import { db } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/profile', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const result = await db.query(
      'SELECT id, email, name, role, family_id FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export { router as familyRouter };