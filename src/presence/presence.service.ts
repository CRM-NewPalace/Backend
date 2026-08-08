import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Se o heartbeat atrasar mais que isso, fecha o segmento e abre outro. */
const GAP_MS = 3 * 60_000;
/** Considera online se o último heartbeat for recente. */
const ONLINE_MS = 2 * 60_000;

export type UserPresenceToday = {
  userId: string;
  secondsToday: number;
  online: boolean;
};

/** Dia civil em America/Sao_Paulo (YYYY-MM-DD). */
export function dateKeyBrasil(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mantém (ou abre) o segmento de sessão do usuário.
   * Ignora super_admin (sem tenant).
   */
  async heartbeat(
    userId: string,
    tenantId: string | null | undefined,
  ): Promise<void> {
    if (!tenantId) return;

    const now = new Date();
    const dateKey = dateKeyBrasil(now);

    const open = await this.prisma.userSessionSegment.findFirst({
      where: { userId, endedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (
      open &&
      open.dateKey === dateKey &&
      now.getTime() - open.lastSeenAt.getTime() < GAP_MS
    ) {
      await this.prisma.userSessionSegment.update({
        where: { id: open.id },
        data: { lastSeenAt: now },
      });
      return;
    }

    if (open) {
      await this.prisma.userSessionSegment.update({
        where: { id: open.id },
        data: { endedAt: open.lastSeenAt },
      });
    }

    await this.prisma.userSessionSegment.create({
      data: {
        userId,
        tenantId,
        dateKey,
        startedAt: now,
        lastSeenAt: now,
      },
    });
  }

  /** Encerra segmentos abertos (logout). */
  async closeOpenSegments(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.userSessionSegment.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: now, lastSeenAt: now },
    });
  }

  /** Soma o tempo ativo de cada usuário no dia atual (fuso BR). */
  async summarizeToday(
    tenantId: string,
    userIds: string[],
  ): Promise<UserPresenceToday[]> {
    if (userIds.length === 0) return [];

    const dateKey = dateKeyBrasil();
    const now = new Date();

    const segments = await this.prisma.userSessionSegment.findMany({
      where: { tenantId, dateKey, userId: { in: userIds } },
      select: {
        userId: true,
        startedAt: true,
        lastSeenAt: true,
        endedAt: true,
      },
    });

    type Acc = {
      seconds: number;
      lastSeen: Date | null;
      hasOpen: boolean;
    };
    const map = new Map<string, Acc>();
    for (const id of userIds) {
      map.set(id, { seconds: 0, lastSeen: null, hasOpen: false });
    }

    for (const segment of segments) {
      const recentlySeen =
        now.getTime() - segment.lastSeenAt.getTime() < ONLINE_MS;
      const effectiveEnd =
        segment.endedAt ??
        (recentlySeen ? now : segment.lastSeenAt);
      const seconds = Math.max(
        0,
        Math.floor(
          (effectiveEnd.getTime() - segment.startedAt.getTime()) / 1000,
        ),
      );
      const cur = map.get(segment.userId)!;
      cur.seconds += seconds;
      if (!cur.lastSeen || segment.lastSeenAt > cur.lastSeen) {
        cur.lastSeen = segment.lastSeenAt;
      }
      if (!segment.endedAt) cur.hasOpen = true;
    }

    return userIds.map((userId) => {
      const cur = map.get(userId)!;
      const online =
        cur.hasOpen &&
        cur.lastSeen != null &&
        now.getTime() - cur.lastSeen.getTime() < ONLINE_MS;
      return {
        userId,
        secondsToday: cur.seconds,
        online,
      };
    });
  }
}
