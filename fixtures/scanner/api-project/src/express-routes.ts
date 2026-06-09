import express from 'express';

const app = express();
const router = express.Router();

interface CreateUserBody {
  email: string;
  name: string;
}

interface RequestWithBody {
  body: CreateUserBody;
}

interface ResponseDto {
  id: string;
}

function requireAuth(): void {
  return undefined;
}

function requireRole(_role: string): void {
  return undefined;
}

function createUser(req: RequestWithBody): ResponseDto {
  return { id: req.body.email };
}

router.get('/users/:id', requireAuth, requireRole('ADMIN'), (_req, _res) => undefined);
app.post('/users', requireAuth, createUser);
