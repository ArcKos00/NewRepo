import fs from 'node:fs';
import { Controller, Get, NotFoundException, Param, ParseIntPipe, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { StoredFile } from '../database/entities';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(
    @InjectRepository(StoredFile) private readonly repo: Repository<StoredFile>,
    private readonly files: FilesService,
  ) {}

  @Get(':id')
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const file = await this.repo.findOneBy({ id });
    if (!file || !fs.existsSync(this.files.pathOf(file))) throw new NotFoundException('Файл не знайдено');
    // Завжди як вкладення, щоб завантажений HTML/SVG не виконувався в браузері.
    res.attachment(file.originalName);
    res.type(file.contentType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(this.files.pathOf(file));
  }
}
