import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../common/multipart';
import { Viewable } from '../auth/auth.guard';
import { AuditContext, Ctx } from '../audit/audit-context';
import { ContractsService } from './contracts.service';
import { ContractDto, DraftDto, SearchDto, ShortfallDto } from './dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Viewable()
  search(@Query() query: SearchDto) {
    return this.contracts.search(query);
  }

  @Get('counterparties')
  @Viewable()
  counterparties() {
    return this.contracts.counterparties();
  }

  @Get(':id')
  @Viewable()
  get(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.get(id);
  }

  @Post()
  create(@Body() dto: ContractDto, @Ctx() ctx: AuditContext) {
    return this.contracts.create(dto, ctx);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ContractDto, @Ctx() ctx: AuditContext) {
    return this.contracts.update(id, dto, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.contracts.remove(id, ctx);
  }

  @Put(':id/file')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  setFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Ctx() ctx: AuditContext,
  ) {
    return this.contracts.setFile(id, file, ctx);
  }

  @Delete(':id/file')
  removeFile(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.contracts.removeFile(id, ctx);
  }

  /** Позначка «сформовано, не підписано» */
  @Put(':id/draft')
  setDraft(@Param('id', ParseIntPipe) id: number, @Body() dto: DraftDto, @Ctx() ctx: AuditContext) {
    return this.contracts.setDraft(id, dto, ctx);
  }

  /** Недопоставка ("не зможуть") та орієнтовна дата поставки */
  @Put(':id/shortfall')
  updateShortfall(@Param('id', ParseIntPipe) id: number, @Body() dto: ShortfallDto, @Ctx() ctx: AuditContext) {
    return this.contracts.updateShortfall(id, dto, ctx);
  }
}
