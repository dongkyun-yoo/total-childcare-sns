import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    familyId: string;
    role: string;
  };
}

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    try {
      // JWT 토큰 검증
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-jwt-secret-key') as any;
      
      // 사용자 정보를 요청 객체에 추가
      req.user = {
        id: decoded.userId,
        familyId: decoded.familyId,
        role: decoded.role
      };

      next();
    } catch (jwtError) {
      // JWT 검증 실패 시 인증 서비스에 확인
      try {
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
        const response = await axios.get(`${authServiceUrl}/api/auth/verify`, {
          headers: { Authorization: authHeader },
          timeout: 5000
        });

        if (response.data.valid) {
          req.user = response.data.user;
          next();
        } else {
          return res.status(401).json({ error: 'Invalid token' });
        }
      } catch (authServiceError) {
        logger.error('Auth service verification failed:', authServiceError);
        return res.status(401).json({ error: 'Authentication failed' });
      }
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireFamilyAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const requestedFamilyId = req.params.familyId || req.body.familyId;
    
    if (!requestedFamilyId) {
      return res.status(400).json({ error: 'Family ID required' });
    }

    if (req.user.familyId !== requestedFamilyId) {
      return res.status(403).json({ error: 'Access denied to this family' });
    }

    next();
  } catch (error) {
    logger.error('Family access check error:', error);
    return res.status(500).json({ error: 'Access validation error' });
  }
};