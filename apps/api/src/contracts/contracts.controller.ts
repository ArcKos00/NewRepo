import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../common/multipart';
import { ContractsService } from './contracts.service';
import { ContractDto, SearchDto, ShortfallDto } from './dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  search(@Query() query: SearchDto) {
    return this.contracts.search(query);
  }

  @Get('counterparties')
  counterparties() {
    return this.contracts.counterparties();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.get(id);
  }

  @Post()
  create(@Body() dto: ContractDto) {
    return this.contracts.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ContractDto) {
    return this.contracts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.remove(id);
  }

  @Put(':id/file')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  setFile(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    return this.contracts.setFile(id, file);
  }

  @Delete(':id/file')
  removeFile(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.removeFile(id);
  }

  /** Недопоставка ("не зможуть") та орієнтовна дата поставки */
  @Put(':id/shortfall')
  updateShortfall(@Param('id', ParseIntPipe) id: number, @Body() dto: ShortfallDto) {
    return this.contracts.updateShortfall(id, dto);
  }
}
