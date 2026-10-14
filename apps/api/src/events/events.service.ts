import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import type { EntityManager } from 'typeorm';
import type { LiveEvent } from '@order-tracking/shared';
import { config } from '../config';

const CHANNEL = 'purchase_changes';
const RECONNECT_MS = 5_000;

/**
 * Живі оновлення через Postgres LISTEN/NOTIFY: подія йде всім подам (і під час RollingUpdate,
 * коли їх два), а NOTIFY у транзакції доставляється лише після COMMIT — відкочена зміна подій не дає.
 */
@Injectable()
export class EventsService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(EventsService.name);
  /** Події для SSE-підписників цього пода. */
  readonly events = new Subject<LiveEvent>();
  private client: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private connectedOnce = false;
  private stopped = false;

  onModuleInit() {
    void this.connect();
  }

  async onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
    this.events.complete();
  }

  /** Подія піде підписникам після COMMIT транзакції `em`. */
  async publish(em: EntityManager, event: LiveEvent) {
    await em.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(event)]);
  }

  private async connect() {
    const client = new Client({ connectionString: config.databaseUrl });
    this.client = client;
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        this.events.next(JSON.parse(msg.payload) as LiveEvent);
      } catch (err) {
        this.log.warn({ err, payload: msg.payload }, 'Некоректна подія з БД');
      }
    });
    client.on('error', (err) => this.reconnect(client, err));
    client.on('end', () => this.reconnect(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
    } catch (err) {
      this.reconnect(client, err);
      return;
    }
    // Поки не слухали, могли пропустити події — хай вкладки перечитають дані.
    if (this.connectedOnce) this.events.next({ type: 'resync' });
    this.connectedOnce = true;
  }

  private reconnect(client: Client, err?: unknown) {
    if (this.stopped || this.client !== client) return;
    this.client = null;
    client.removeAllListeners();
    client.on('error', () => undefined);
    client.end().catch(() => undefined);
    this.log.warn({ err }, `Втрачено LISTEN ${CHANNEL}, повтор через ${RECONNECT_MS / 1000} с`);
    this.timer = setTimeout(() => void this.connect(), RECONNECT_MS);
  }
}
