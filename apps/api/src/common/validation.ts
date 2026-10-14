import { UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';
import type { ValidationErrorBody } from '@order-tracking/shared';

/** Кидає 422 з помилками за шляхом поля ("items.0.quantity"); ключ "_" — загальна помилка. */
export function fail(errors: Record<string, string>): never {
  const body: ValidationErrorBody = { statusCode: 422, message: 'Перевірте введені дані', errors };
  throw new UnprocessableEntityException(body);
}

// Якщо поле порушує кілька правил — спершу показуємо "заповніть"/"невірний формат", а не межі.
const PRIORITY = ['isNotEmpty', 'isDefined', 'isString', 'isNumber', 'isInt', 'matches', 'isArray', 'arrayMinSize'];

function firstMessage(constraints: Record<string, string>) {
  const key = PRIORITY.find((k) => k in constraints) ?? Object.keys(constraints)[0];
  return key ? constraints[key] : undefined;
}

function flatten(list: ValidationError[], prefix = '', out: Record<string, string> = {}) {
  for (const e of list) {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    const message = firstMessage(e.constraints ?? {});
    if (message && !out[path]) out[path] = message;
    if (e.children?.length) flatten(e.children, path, out);
  }
  return out;
}

export const validationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidUnknownValues: false,
  exceptionFactory: (errors) => {
    const flat = flatten(errors);
    // Порожній масив/відсутнє поле items і т.п. показуємо як загальну помилку
    if (flat.items && !flat._) flat._ = flat.items;
    return new UnprocessableEntityException({ statusCode: 422, message: 'Перевірте введені дані', errors: flat });
  },
});
