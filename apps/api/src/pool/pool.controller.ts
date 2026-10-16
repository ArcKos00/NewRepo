import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Viewable } from '../auth/auth.guard';
import { AuditContext, Ctx } from '../audit/audit-context';
import { PoolService } from './pool.service';
import { PoolContractDto, PoolItemDto, PoolSearchDto } from './dto';

/** Нерозподілені найменування і договір з них. */
@Controller('pool')
export class PoolController {
  constructor(private readonly pool: PoolService) {}

  @Get()
  @Viewable()
  search(@Query() query: PoolSearchDto) {
    return this.pool.search(query);
  }

  /** Усе, що ще можна розподілити (залишок > 0) — для форми «Створити замовлення з нерозподіленого». */
  @Get('available')
  @Viewable()
  available() {
    return this.pool.available();
  }

  @Post()
  create(@Body() dto: PoolItemDto, @Ctx() ctx: AuditContext) {
    return this.pool.create(dto, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.pool.remove(id, ctx);
  }

  @Post('contract')
  createContract(@Body() dto: PoolContractDto, @Ctx() ctx: AuditContext) {
    return this.pool.createContract(dto, ctx);
  }
}
