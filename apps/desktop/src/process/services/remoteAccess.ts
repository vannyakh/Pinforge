import { BrowserWindow } from "electron";
import type { RemoteUser, RemoteUserStatus } from "../../common/remote/types";
import { getStore } from "../store";
import { isUninstallWindow } from "../uninstallWindow";

export type RemoteAccessResult = "approved" | "pending" | "denied";

export function broadcastRemoteUsersChanged(): void {
  const users = listRemoteUsers();
  for (const win of BrowserWindow.getAllWindows()) {
    if (isUninstallWindow(win)) continue;
    win.webContents.send("remote:usersChanged", users);
  }
}

export function channelRequiresApproval(channelId: string): boolean {
  const remote = getStore().get("remote");
  const channel = remote.channels.find((c) => c.id === channelId);
  if (!channel) return true;
  return channel.requireApproval !== false;
}

export function listRemoteUsers(filter?: {
  channel?: string;
  status?: RemoteUserStatus;
}): RemoteUser[] {
  const users = getStore().get("remote").users ?? [];
  return users
    .filter((u) => {
      if (filter?.channel && u.channel !== filter.channel) return false;
      if (filter?.status && u.status !== filter.status) return false;
      return true;
    })
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

function saveUsers(users: RemoteUser[]): RemoteUser[] {
  const store = getStore();
  const remote = store.get("remote");
  store.set("remote", { ...remote, users });
  broadcastRemoteUsersChanged();
  return users;
}

export function touchRemoteUser(input: {
  channel: string;
  externalId: string;
  username?: string;
  displayName?: string;
}): { user: RemoteUser; created: boolean } {
  const store = getStore();
  const remote = store.get("remote");
  const users = [...(remote.users ?? [])];
  const externalId = input.externalId.trim();
  const idx = users.findIndex((u) => u.channel === input.channel && u.externalId === externalId);

  if (idx >= 0) {
    const prev = users[idx]!;
    const next: RemoteUser = {
      ...prev,
      username: input.username?.trim() || prev.username,
      displayName: input.displayName?.trim() || prev.displayName,
    };
    if (next.username !== prev.username || next.displayName !== prev.displayName) {
      users[idx] = next;
      saveUsers(users);
    }
    return { user: next, created: false };
  }

  const user: RemoteUser = {
    id: `remote-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channel: input.channel,
    externalId,
    username: input.username?.trim() || undefined,
    displayName: input.displayName?.trim() || undefined,
    status: "pending",
    requestedAt: Date.now(),
  };
  users.unshift(user);
  saveUsers(users);
  return { user, created: true };
}

export function resolveRemoteAccess(channel: string, externalId: string): RemoteAccessResult {
  if (!channelRequiresApproval(channel)) return "approved";

  const user = listRemoteUsers().find((u) => u.channel === channel && u.externalId === externalId);
  if (!user) return "pending";
  return user.status;
}

export function getRemoteUserById(userId: string): RemoteUser | null {
  return listRemoteUsers().find((u) => u.id === userId) ?? null;
}

export function setRemoteUserAdminMessage(userId: string, adminMessageId: number): void {
  const store = getStore();
  const remote = store.get("remote");
  const users = [...(remote.users ?? [])];
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return;
  users[idx] = { ...users[idx]!, adminMessageId };
  saveUsers(users);
}

export function setRemoteUserStatus(userId: string, status: RemoteUserStatus): RemoteUser | null {
  const store = getStore();
  const remote = store.get("remote");
  const users = [...(remote.users ?? [])];
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return null;

  const next: RemoteUser = {
    ...users[idx]!,
    status,
    decidedAt: Date.now(),
  };
  users[idx] = next;
  saveUsers(users);
  return next;
}

export function removeRemoteUser(userId: string): boolean {
  const store = getStore();
  const remote = store.get("remote");
  const users = (remote.users ?? []).filter((u) => u.id !== userId);
  if (users.length === (remote.users ?? []).length) return false;
  saveUsers(users);
  return true;
}
