import crypto from "node:crypto";
import fs from "node:fs";

import type { RoundScoreResult } from "../domain/scoring.js";

export type AccountRole = "player" | "admin";

interface UserAccount {
  userId: string;
  name: string;
  passwordHash: string;
  role: AccountRole;
  balance: number;
  ledger: AccountLedgerEntry[];
}

interface SessionRecord {
  token: string;
  userId: string;
}

export interface AuthenticatedUserView {
  userId: string;
  name: string;
  role: AccountRole;
  balance: number;
  ledger: AccountLedgerEntryView[];
}

export interface AdminUserView extends AuthenticatedUserView {}

interface AccountLedgerEntry {
  id: string;
  timestamp: string;
  amount: number;
  balanceAfter: number;
  reason: string;
}

export interface AccountLedgerEntryView extends AccountLedgerEntry {}

export interface SettlementUpdate {
  userId: string;
  balance: number;
  delta: number;
}

interface AccountStoreSnapshot {
  users: UserAccount[];
  auditLog: string[];
}

interface AccountServiceOptions {
  storagePath?: string;
}

export class AccountService {
  private readonly users = new Map<string, UserAccount>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly auditLog: string[] = [];
  private readonly storagePath: string | null;

  constructor(options: AccountServiceOptions = {}) {
    this.storagePath = options.storagePath ?? null;
    this.loadStore();
    this.seedAdminAccount();
  }

  signup(userId: string, name: string, password: string): { token: string; user: AuthenticatedUserView } {
    const normalizedUserId = normalizeUserId(userId);
    const normalizedName = normalizeName(name);
    validatePassword(password);

    if (this.users.has(normalizedUserId)) {
      throw new Error("ID already exists.");
    }

    const account: UserAccount = {
      userId: normalizedUserId,
      name: normalizedName,
      passwordHash: hashPassword(password),
      role: "player",
      balance: 0,
      ledger: []
    };
    this.users.set(normalizedUserId, account);
    this.recordAudit(`User ${normalizedUserId} signed up.`);
    this.persistStore();

    const token = this.createSession(normalizedUserId);
    return {
      token,
      user: toUserView(account)
    };
  }

  login(userId: string, password: string): { token: string; user: AuthenticatedUserView } {
    const normalizedUserId = normalizeUserId(userId);
    const account = this.users.get(normalizedUserId);
    if (account === undefined || account.passwordHash !== hashPassword(password)) {
      throw new Error("Invalid ID or password.");
    }

    if (this.hasActiveSessionForUser(normalizedUserId)) {
      throw new Error("This account is already logged in.");
    }

    const token = this.createSession(normalizedUserId);
    this.recordAudit(`User ${normalizedUserId} logged in.`);
    this.persistStore();
    return {
      token,
      user: toUserView(account)
    };
  }

  restoreSession(token: string): AuthenticatedUserView {
    return toUserView(this.getSessionUser(token));
  }

  logout(token: string): void {
    const session = this.sessions.get(token);
    if (session === undefined) {
      return;
    }

    this.sessions.delete(token);
    this.recordAudit(`User ${session.userId} logged out.`);
    this.persistStore();
  }

  authenticateSocket(userId: string, token: string): AuthenticatedUserView {
    const account = this.getSessionUser(token);
    if (account.userId !== normalizeUserId(userId)) {
      throw new Error("Session does not match the requested player ID.");
    }

    return toUserView(account);
  }

  updateName(userId: string, name: string): AuthenticatedUserView {
    const account = this.getRequiredUser(userId);
    account.name = normalizeName(name);
    this.recordAudit(`User ${account.userId} updated their public name to ${account.name}.`);
    this.persistStore();
    return toUserView(account);
  }

  adjustBalance(adminUserId: string, targetUserId: string, amount: number): AuthenticatedUserView {
    this.assertAdmin(adminUserId);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error("Adjustment amount must be a non-zero number.");
    }

    const target = this.getRequiredUser(targetUserId);
    target.balance += amount;
    this.recordLedgerEntry(target, amount, `Admin adjustment by ${adminUserId}`);
    this.recordAudit(`Admin ${adminUserId} adjusted ${target.userId} by ${amount}.`);
    this.persistStore();
    return toUserView(target);
  }

  applyRoundSettlement(result: RoundScoreResult): SettlementUpdate[] {
    if (result.status !== "scored") {
      return [];
    }

    const updates = result.players.map((player) => {
      const account = this.getRequiredUser(player.playerId);
      account.balance += player.amountWon;
      this.recordLedgerEntry(account, player.amountWon, "Round settlement");
      return {
        userId: account.userId,
        balance: account.balance,
        delta: player.amountWon
      };
    });

    if (updates.length > 0) {
      this.recordAudit(
        `Round settlement applied: ${updates.map((update) => `${update.userId} ${formatSignedAmount(update.delta)}`).join(", ")}.`
      );
      this.persistStore();
    }

    return updates;
  }

  listUsers(adminUserId: string): AdminUserView[] {
    this.assertAdmin(adminUserId);
    return [...this.users.values()]
      .map(toUserView)
      .sort((left, right) => left.userId.localeCompare(right.userId));
  }

  getAuditLog(adminUserId: string): string[] {
    this.assertAdmin(adminUserId);
    return [...this.auditLog];
  }

  getUserView(userId: string): AuthenticatedUserView {
    return toUserView(this.getRequiredUser(userId));
  }

  purgeNonAdminAccounts(): { removedUserIds: string[] } {
    const removedUserIds = [...this.users.values()]
      .filter((user) => user.role !== "admin")
      .map((user) => user.userId);

    if (removedUserIds.length === 0) {
      return { removedUserIds: [] };
    }

    for (const userId of removedUserIds) {
      this.users.delete(userId);
    }

    for (const [token, session] of this.sessions.entries()) {
      if (removedUserIds.includes(session.userId)) {
        this.sessions.delete(token);
      }
    }

    this.recordAudit(`Purged player accounts: ${removedUserIds.join(", ")}.`);
    this.persistStore();

    return { removedUserIds };
  }

  private seedAdminAccount(): void {
    const adminId = "admin";
    if (this.users.has(adminId)) {
      return;
    }

    this.users.set(adminId, {
      userId: adminId,
      name: "관리자",
      passwordHash: hashPassword("admin1234"),
      role: "admin",
      balance: 0,
      ledger: []
    });
    this.recordAudit("Default admin account seeded.");
    this.persistStore();
  }

  private createSession(userId: string): string {
    const token = crypto.randomUUID();
    this.sessions.set(token, {
      token,
      userId
    });
    return token;
  }

  private getSessionUser(token: string): UserAccount {
    const session = this.sessions.get(token);
    if (session === undefined) {
      throw new Error("Session is invalid or expired.");
    }

    return this.getRequiredUser(session.userId);
  }

  private getRequiredUser(userId: string): UserAccount {
    const normalizedUserId = normalizeUserId(userId);
    const account = this.users.get(normalizedUserId);
    if (account === undefined) {
      throw new Error(`User ${normalizedUserId} does not exist.`);
    }

    return account;
  }

  private hasActiveSessionForUser(userId: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        return true;
      }
    }

    return false;
  }

  private assertAdmin(userId: string): void {
    const user = this.getRequiredUser(userId);
    if (user.role !== "admin") {
      throw new Error("Admin privileges are required.");
    }
  }

  private recordAudit(entry: string): void {
    this.auditLog.unshift(entry);
    if (this.auditLog.length > 50) {
      this.auditLog.length = 50;
    }
  }

  private recordLedgerEntry(account: UserAccount, amount: number, reason: string): void {
    account.ledger.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      amount,
      balanceAfter: account.balance,
      reason
    });
    if (account.ledger.length > 20) {
      account.ledger.length = 20;
    }
  }

  private loadStore(): void {
    if (this.storagePath === null || !fs.existsSync(this.storagePath)) {
      return;
    }

    const rawStore = fs.readFileSync(this.storagePath, "utf8");
    const snapshot = JSON.parse(rawStore) as Partial<AccountStoreSnapshot>;

    for (const user of snapshot.users ?? []) {
      this.users.set(user.userId, {
        ...user,
        ledger: Array.isArray(user.ledger) ? user.ledger : []
      });
    }

    for (const entry of snapshot.auditLog ?? []) {
      if (typeof entry === "string") {
        this.auditLog.push(entry);
      }
    }
  }

  private persistStore(): void {
    if (this.storagePath === null) {
      return;
    }

    const snapshot: AccountStoreSnapshot = {
      users: [...this.users.values()],
      auditLog: [...this.auditLog]
    };

    fs.mkdirSync(getParentDirectory(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(snapshot, null, 2));
  }
}

function normalizeUserId(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "") {
    throw new Error("ID is required.");
  }

  return normalizedValue;
}

function normalizeName(value: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue === "") {
    throw new Error("Name is required.");
  }

  return normalizedValue;
}

function validatePassword(value: string): void {
  if (value.trim().length < 4) {
    throw new Error("Password must be at least 4 characters long.");
  }
}

function hashPassword(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toUserView(account: UserAccount): AuthenticatedUserView {
  return {
    userId: account.userId,
    name: account.name,
    role: account.role,
    balance: account.balance,
    ledger: account.ledger.map((entry) => ({ ...entry }))
  };
}

function formatSignedAmount(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function getParentDirectory(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return separatorIndex === -1 ? "." : filePath.slice(0, separatorIndex);
}
