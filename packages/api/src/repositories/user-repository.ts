import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import type { UserRecord } from "../persistence/records.ts";

export class UserRepository {
  private readonly storage: InspectionStorage;

  constructor(storage: InspectionStorage) {
    this.storage = storage;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const normalizedUsername = username.trim().toLowerCase();

    if (this.storage.readUserByUsername) {
      return this.storage.readUserByUsername(normalizedUsername);
    }

    const snapshot = await this.storage.read();
    return (
      snapshot.users.find(
        (user) => user.username.trim().toLowerCase() === normalizedUsername
      ) ?? null
    );
  }
}
