import { verifyPasswordHash } from "../auth/password.ts";
import type { UserRecord } from "../persistence/records.ts";
import { UserRepository } from "../repositories/user-repository.ts";

export interface LoginResult {
  user: {
    id: string;
    username: string;
    displayName: string;
    role: UserRecord["role"];
    disciplines: UserRecord["disciplines"];
  };
}

export interface AuthenticatedUserProfile {
  id: string;
  username: string;
  displayName: string;
  role: UserRecord["role"];
  disciplines: UserRecord["disciplines"];
}

export class AuthService {
  private readonly users: UserRepository;

  constructor(users: UserRepository) {
    this.users = users;
  }

  async login(credentials: { username: string; password: string }): Promise<LoginResult> {
    const user = await this.users.findByUsername(credentials.username);

    if (!user || user.isActive !== 1) {
      throw new Error("AUTH_INVALID_CREDENTIALS");
    }

    const isValidPassword = await verifyPasswordHash(credentials.password, user.passwordHash);

    if (!isValidPassword) {
      throw new Error("AUTH_INVALID_CREDENTIALS");
    }

    return {
      user: this.toUserProfile(user)
    };
  }

  async getUserProfile(userId: string): Promise<AuthenticatedUserProfile> {
    const user = await this.users.findById(userId);

    if (!user || user.isActive !== 1) {
      throw new Error("AUTH_USER_NOT_FOUND");
    }

    return this.toUserProfile(user);
  }

  private toUserProfile(user: UserRecord): AuthenticatedUserProfile {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      disciplines: [...user.disciplines]
    };
  }
}
