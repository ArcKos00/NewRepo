import {
  Body, Controller, Delete, Param, ParseIntPipe, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseJsonField, uploadOptions } from '../common/multipart';
import { DeliveriesService } from './deliveries.service';
import { DeliveryDto } from './dto';
import { AuditContext, Ctx } from '../audit/audit-context';

@Controller()
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  /** multipart/form-data: `data` — JSON з DeliveryInput, `file` — скан накладної (необов'язково). */
  @Post('contracts/:id/deliveries')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async create(
    @Param('id', ParseIntPipe) id: number,
    @Body('data') data: string,
    @Ctx() ctx: AuditContext,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.deliveries.create(id, await parseJsonField(data, DeliveryDto), ctx, file);
  }

  @Delete('deliveries/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.deliveries.remove(id, ctx);
  }
}
