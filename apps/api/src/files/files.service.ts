import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { config } from '../config';
import { StoredFile } from '../database/entities';

/** Файли лежать на диску (config.uploadsDir), метадані — у таблиці files. */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor() {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }

  pathOf(file: StoredFile) {
    return path.join(config.uploadsDir, path.basename(file.storedName));
  }

  /** Записує файл на диск і створює запис у БД (в межах переданої транзакції). */
  async save(em: EntityManager, upload: Express.Multer.File): Promise<StoredFile> {
    // multer віддає ім'я в latin1 — перекодовуємо, щоб кирилиця не ламалась.
    const originalName = Buffer.from(upload.originalname, 'latin1').toString('utf8');
    let ext = path.extname(originalName).toLowerCase();
    if (!/^\.[a-z0-9]{1,10}$/.test(ext)) ext = '';
    const storedName = crypto.randomUUID().replaceAll('-', '') + ext;
    await fs.promises.writeFile(path.join(config.uploadsDir, storedName), upload.buffer);

    return em.save(StoredFile, em.create(StoredFile, {
      originalName,
      storedName,
      contentType: upload.mimetype || 'application/octet-stream',
      size: upload.size,
    }));
  }

  /** Видаляє файл з диска (після успішного коміту транзакції). */
  removeFromDisk(files: (StoredFile | null | undefined)[]) {
    for (const f of files) {
      if (!f) continue;
      fs.rm(this.pathOf(f), { force: true }, (err) => {
        if (err) this.logger.warn({ err, fileId: f.id, storedName: f.storedName }, 'Не вдалося видалити файл з диска');
      });
    }
  }
}
