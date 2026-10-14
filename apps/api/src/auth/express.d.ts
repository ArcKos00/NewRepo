declare global {
  namespace Express {
    interface User {
      username: string;
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
