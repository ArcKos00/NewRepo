import { BadRequestException, Type } from '@nestjs/common';
import { validationPipe } from './validation';
import { config } from '../config';

/** Обмеження для завантажень (multer, у пам'яті). */
export const uploadOptions = { limits: { fileSize: config.maxUploadMb * 1024 * 1024 } };

/**
 * Для multipart-запитів дані форми передаються JSON-рядком у полі `data` (поряд із файлом).
 * Розбираємо його і проганяємо через ту саму валідацію, що й JSON-тіла.
 */
export async function parseJsonField<T>(raw: unknown, metatype: Type<T>): Promise<T> {
  let value: unknown;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new BadRequestException('Поле data має містити JSON');
  }
  if (!value || typeof value !== 'object') throw new BadRequestException('Поле data обов’язкове');
  return validationPipe.transform(value, { type: 'body', metatype }) as Promise<T>;
}
