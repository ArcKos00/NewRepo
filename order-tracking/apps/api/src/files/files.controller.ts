import fs from 'node:fs';
import { Controller, Get, NotFoundException, Param, ParseIntPipe, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { Contract, Delivery, StoredFile } from '../database/entities';
import { AuditService } from '../audit/audit.service';
import { AuditContext, Ctx } from '../audit/audit-context';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(
    @InjectRepository(StoredFile) private readonly repo: Repository<StoredFile>,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  @Get(':id')
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response, @Ctx() ctx: AuditContext) {
    const file = await this.repo.findOneBy({ id });
    if (!file || !fs.existsSync(this.files.pathOf(file))) throw new NotFoundException('Файл не знайдено');
    // Чий це файл — договору чи накладної поставки
    const em = this.repo.manager;
    const contract = await em.findOneBy(Contract, { fileId: id });
    const delivery = contract ? null : await em.findOneBy(Delivery, { fileId: id });
    await this.audit.recordSafe(ctx, {
      action: 'file.download',
      entityType: 'file',
      entityId: id,
      contractId: contract?.id ?? delivery?.contractId ?? null,
      summary:
        `Відкрито файл «${file.originalName}»` +
        (contract ? ` договору № ${contract.number}` : delivery ? ` накладної № ${delivery.invoiceNumber}` : ''),
      details: { file: { id, name: file.originalName, size: file.size }, deliveryId: delivery?.id ?? null },
    });
    // Завжди як вкладення, щоб завантажений HTML/SVG не виконувався в браузері.
    res.attachment(file.originalName);
    res.type(file.contentType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(this.files.pathOf(file));
  }
}
