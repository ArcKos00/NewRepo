import { INestApplication } from '@nestjs/common';
import { validationPipe } from './common/validation';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe);
}
